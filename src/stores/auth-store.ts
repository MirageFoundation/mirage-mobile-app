import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import * as Sentry from "@sentry/react-native";
import { walletService } from "@/src/services/wallet-service";
import { usePreferencesStore } from "./preferences-store";
import { useHomePostCardStore } from "./home-post-card-store";
import { useContentModerationStore } from "./content-moderation-store";
import { useInboxStore } from "./inbox-store";
import { useDraftStore } from "./draft-store";
import { unregisterPush } from "@/src/services/push-notifications";
import { getTierName } from "@/src/utils/tiers";
import {
  addAuthBootstrapBreadcrumb,
  bootstrapAnonymousAfterLogout,
  bootstrapAnonymousStartup,
  bootstrapAuthSession,
  resolveAndCacheAuthUserStatus,
  startAuthUserStatusBootstrap,
  type AuthUserStatusSnapshot,
} from "@/src/services/auth-bootstrap";

// ============================================
// Types
// ============================================

export type User = {
  id: string;
  username: string | null;
  walletAddress: string;
  tier: string;
  avatar?: string;
  followerCount?: number;
};

// ============================================
// Development Configuration
// ============================================

// Set to true to force mock user (for development/UI testing)
const USE_MOCK_USER = false;

// Mock user for development
const MOCK_USER: User = {
  id: "user_123",
  username: "sonali",
  walletAddress: "mirage1mockaddress123456789",
  tier: "Free",
  avatar: undefined,
  followerCount: 128,
};

function buildUserFromStatus(
  walletAddress: string,
  snapshot: AuthUserStatusSnapshot,
): User {
  return {
    id: walletAddress,
    username: snapshot.username,
    walletAddress,
    tier: snapshot.tier,
  };
}

// ============================================
// Auth State
// ============================================

type AuthState = {
  // User state
  user: User | null;
  isLoggedIn: boolean;

  // Wallet state
  walletAddress: string | null;
  publicKeyBase64: string | null;
  userLevel: number; // 0 = free, 1 = subscriber, 10 = agent
  hasUsername: boolean;

  // Onboarding state
  hasOnboarded: boolean;
  recoveryPhrase: string | null; // Temporarily stored during onboarding flow

  // Loading state
  isInitializing: boolean;
  isCreatingWallet: boolean;
  isBootstrapping: boolean;

  // Actions - Initialization
  initializeWallet: () => Promise<void>;

  // Actions - Wallet lifecycle
  createNewWallet: () => Promise<string>; // returns mnemonic for display
  importWallet: (mnemonic: string) => Promise<void>;
  confirmWalletCreation: () => Promise<void>; // Called after user confirms recovery phrase
  logout: () => Promise<void>;

  // Actions - User state updates
  setUser: (user: User) => void;
  setUserLevel: (level: number) => void;
  setHasUsername: (has: boolean, username?: string) => void;
  setRecoveryPhrase: (phrase: string | null) => void;

  // Actions - Helpers
  clearRecoveryPhrase: () => void;
};

// ============================================
// Store Implementation
// ============================================

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: USE_MOCK_USER ? MOCK_USER : null,
      isLoggedIn: USE_MOCK_USER,
      walletAddress: USE_MOCK_USER ? MOCK_USER.walletAddress : null,
      publicKeyBase64: null,
      userLevel: 0,
      hasUsername: USE_MOCK_USER,
      hasOnboarded: USE_MOCK_USER,
      recoveryPhrase: null,
      isInitializing: true,
      isCreatingWallet: false,
      isBootstrapping: false,

      // ============================================
      // Initialization
      // ============================================

      initializeWallet: async () => {
        if (USE_MOCK_USER) {
          set({ isInitializing: false });
          return;
        }

        try {
          set({ isInitializing: true });

          await walletService.migrateKeychainAccessibility();

          const cleanedUp = await walletService.cleanupPendingWallet();
          if (cleanedUp) {
            console.log(
              "[AuthStore] Cleaned up pending wallet from incomplete signup",
            );
          }

          let hasWalletResult = await walletService.hasWallet();

          if (!hasWalletResult && get().isLoggedIn) {
            await new Promise((r) => setTimeout(r, 500));
            hasWalletResult = await walletService.hasWallet();
          }

          if (!hasWalletResult) {
            await bootstrapAnonymousStartup();
            set({
              isLoggedIn: false,
              walletAddress: null,
              publicKeyBase64: null,
              hasOnboarded: false,
              isInitializing: false,
            });
            return;
          }

          const metadata = walletService.getWalletMetadata();

          if (metadata) {
            Sentry.setUser({
              id: metadata.address,
            });
            set({
              isLoggedIn: true,
              isBootstrapping: true,
              walletAddress: metadata.address,
              publicKeyBase64: metadata.publicKeyBase64,
              hasUsername: metadata.hasUsername,
              hasOnboarded: true,
              userLevel: get().userLevel,
              user: {
                id: metadata.address,
                username: null,
                walletAddress: metadata.address,
                tier: "Free",
              },
            });

            const bootstrapResponse = await bootstrapAuthSession(
              metadata.address,
              "Logged-in startup",
            );

            set({ isInitializing: false });

            resolveAndCacheAuthUserStatus(metadata.address, bootstrapResponse)
              .then((snapshot) => {
                set({
                  hasUsername: snapshot.hasUsername,
                  userLevel: snapshot.userLevel,
                  user: buildUserFromStatus(metadata.address, snapshot),
                });
              })
              .catch((apiError) => {
                console.warn(
                  "[AuthStore] Failed to fetch user status from API:",
                  apiError,
                );
                Sentry.addBreadcrumb({
                  category: "auth",
                  message: "Failed to fetch user status",
                  level: "warning",
                });
                Sentry.captureException(apiError, {
                  tags: {
                    feature: "auth-bootstrap",
                    operation: "startup-user-status",
                  },
                });
              })
              .finally(() => {
                addAuthBootstrapBreadcrumb("Logged-in startup bootstrap gating disabled");
                set({ isBootstrapping: false });
              });

            return;
          }
        } catch (error) {
          set({ isBootstrapping: false });
          console.error("[AuthStore] Failed to initialize wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_init" },
          });
          set({
            isLoggedIn: false,
            walletAddress: null,
            publicKeyBase64: null,
            isInitializing: false,
          });
          return;
        }
        set({ isInitializing: false });
      },

      // ============================================
      // Wallet Creation & Import
      // ============================================

      createNewWallet: async () => {
        set({ isCreatingWallet: true });

        try {
          const metadata = await walletService.createWallet();

          const mnemonic = await walletService.exportMnemonic();

          if (!mnemonic) {
            throw new Error(
              "Failed to retrieve mnemonic after wallet creation",
            );
          }

          set({
            recoveryPhrase: mnemonic,
            walletAddress: metadata.address,
            publicKeyBase64: metadata.publicKeyBase64,
          });

          return mnemonic;
        } catch (error) {
          console.error("[AuthStore] Failed to create wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_create" },
          });
          throw error;
        } finally {
          set({ isCreatingWallet: false });
        }
      },

      importWallet: async (mnemonic: string) => {
        set({ isCreatingWallet: true });

        try {
          if (await walletService.hasWallet()) {
            await walletService.clearWallet();
          }

          const metadata = await walletService.importWallet(mnemonic);

          Sentry.setUser({
            id: metadata.address,
          });
          Sentry.addBreadcrumb({
            category: "auth",
            message: "Wallet imported successfully",
            level: "info",
          });
          set({
            isLoggedIn: true,
            isBootstrapping: true,
            walletAddress: metadata.address,
            publicKeyBase64: metadata.publicKeyBase64,
            hasUsername: metadata.hasUsername,
            hasOnboarded: true,
            user: {
              id: metadata.address,
              username: null,
              walletAddress: metadata.address,
              tier: "Free",
            },
          });
          const bootstrapResponse = await bootstrapAuthSession(
            metadata.address,
            "Import",
          );
          const snapshot = await resolveAndCacheAuthUserStatus(
            metadata.address,
            bootstrapResponse,
          );

          set({
            hasUsername: snapshot.hasUsername,
            userLevel: snapshot.userLevel,
            user: buildUserFromStatus(metadata.address, snapshot),
          });
        } catch (error) {
          set({ isBootstrapping: false });
          console.error("[AuthStore] Failed to import wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_import" },
          });
          throw error;
        } finally {
          set({ isCreatingWallet: false, isBootstrapping: false });
        }
      },

      confirmWalletCreation: async () => {
        const { walletAddress, user } = get();

        if (!walletAddress) {
          throw new Error("No wallet to confirm");
        }

        walletService.confirmWallet();

        set({
          isLoggedIn: true,
          isBootstrapping: true,
          hasOnboarded: true,
          recoveryPhrase: null,
          user: {
            id: walletAddress,
            username: user?.username ?? null,
            walletAddress,
            tier: "Free",
          },
        });

        startAuthUserStatusBootstrap(
          walletAddress,
          "New wallet",
          (snapshot) => {
            set({
              hasUsername: snapshot.hasUsername,
              userLevel: snapshot.userLevel,
              user: buildUserFromStatus(walletAddress, snapshot),
            });
          },
          () => {
            addAuthBootstrapBreadcrumb("New wallet bootstrap gating disabled");
            set({ isBootstrapping: false });
          },
        );
      },

      logout: async () => {
        try {
          const wallet = await walletService.getWallet();
          await unregisterPush(wallet);
          await walletService.clearWallet();
        } catch (error) {
          console.error("[AuthStore] Failed to clear wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_clear" },
          });
        }

        Sentry.setUser(null);
        Sentry.addBreadcrumb({
          category: "auth",
          message: "User logged out",
          level: "info",
        });
        set({
          user: null,
          isLoggedIn: false,
          walletAddress: null,
          publicKeyBase64: null,
          userLevel: 0,
          hasUsername: false,
          isBootstrapping: true,
          hasOnboarded: false,
          recoveryPhrase: null,
        });

        useHomePostCardStore.getState().reset();
        useContentModerationStore.getState().clearAll();
        useInboxStore.getState().resetForLogout();
        usePreferencesStore.setState({ hasSeenAdultPrompt: false });
        usePreferencesStore.setState({ ageVerified: false });
        useDraftStore.getState().clearDraft();
        bootstrapAnonymousAfterLogout(() => {
          set({ isBootstrapping: false });
        });
      },

      // ============================================
      // State Updates
      // ============================================

      setUser: (user) =>
        set({
          user,
          isLoggedIn: true,
          walletAddress: user.walletAddress,
        }),

      setUserLevel: (level) => {
        set({ userLevel: level });

        const { user } = get();
        if (user) {
          set({
            user: { ...user, tier: getTierName(level) },
          });
        }
      },

      setHasUsername: (has, username) => {
        set({ hasUsername: has });

        if (username) {
          const { user, walletAddress } = get();
          set({
            user: {
              id: user?.id ?? walletAddress ?? "",
              username,
              walletAddress: user?.walletAddress ?? walletAddress ?? "",
              tier: user?.tier ?? "Free",
            },
          });
        }

        walletService.updateMetadata({ hasUsername: has });
      },

      setRecoveryPhrase: (phrase) => set({ recoveryPhrase: phrase }),

      clearRecoveryPhrase: () => set({ recoveryPhrase: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        hasOnboarded: state.hasOnboarded,
        userLevel: state.userLevel,
        hasUsername: state.hasUsername,
        isLoggedIn: state.isLoggedIn,
        walletAddress: state.walletAddress,
        publicKeyBase64: state.publicKeyBase64,
      }),
      merge: (persistedState, currentState) => {
        if (USE_MOCK_USER) {
          return {
            ...currentState,
            ...(persistedState as Partial<AuthState>),
            user: MOCK_USER,
            isLoggedIn: true,
            walletAddress: MOCK_USER.walletAddress,
            hasOnboarded: true,
          };
        }
        return {
          ...currentState,
          ...(persistedState as Partial<AuthState>),
        };
      },
    },
  ),
);

// ============================================
// Selectors (for performance optimization)
// ============================================

export const useIsLoggedIn = () => useAuthStore((s) => s.isLoggedIn);
export const useWalletAddress = () => useAuthStore((s) => s.walletAddress);
export const useUserLevel = () => useAuthStore((s) => s.userLevel);
export const useHasUsername = () => useAuthStore((s) => s.hasUsername);
export const useIsInitializing = () => useAuthStore((s) => s.isInitializing);
