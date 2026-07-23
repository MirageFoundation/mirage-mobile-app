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
import "./comment-compose-store";
import "./history-store";
import "./pending-posts-store";
import "./saved-posts-store";
import "./search-store";
import {
  clearWalletScopedState,
  selectWalletStorageNamespace,
} from "./wallet-scoped-storage";
import { removePersistedQueryCache } from "@/src/api/cache/persisted-query-storage";
import { getServerIdentity } from "@/src/api/server-runtime";
import {
  identifyUser,
  registerTierSuperProperty,
  resetAnalyticsIdentity,
  trackEvent,
  updateUserProfile,
} from "@/src/services/analytics";
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
import {
  authSessionCoordinator,
  type AuthSessionToken,
} from "@/src/services/auth-session-coordinator";

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

function beginAuthTransition(walletAddress?: string | null): AuthSessionToken {
  const token = authSessionCoordinator.begin(walletAddress);
  clearWalletScopedState();
  return token;
}

async function selectWalletStorageForSession(
  token: AuthSessionToken,
): Promise<void> {
  await authSessionCoordinator.enqueueIdentityMutation(async () => {
    if (!authSessionCoordinator.isCurrent(token)) return;
    await selectWalletStorageNamespace(token.walletAddress);
  });
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
  setUser: (user: User) => Promise<void>;
  setUserLevel: (level: number, walletAddress: string) => void;
  setHasUsername: (has: boolean, username: string | undefined, walletAddress: string) => void;
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

        let session = beginAuthTransition(null);
        try {
          set({ isInitializing: true });

          await walletService.migrateKeychainAccessibility();
          if (!authSessionCoordinator.isCurrent(session)) return;

          const cleanedUp = await walletService.cleanupPendingWallet();
          if (!authSessionCoordinator.isCurrent(session)) return;
          if (cleanedUp) {
            console.log(
              "[AuthStore] Cleaned up pending wallet from incomplete signup",
            );
          }

          let hasWalletResult = await walletService.hasWallet();
          if (!authSessionCoordinator.isCurrent(session)) return;

          if (!hasWalletResult && get().isLoggedIn) {
            await new Promise((r) => setTimeout(r, 500));
            if (!authSessionCoordinator.isCurrent(session)) return;
            hasWalletResult = await walletService.hasWallet();
            if (!authSessionCoordinator.isCurrent(session)) return;
          }

          if (!hasWalletResult) {
            await selectWalletStorageForSession(session);
            const isCurrent = () => authSessionCoordinator.isCurrent(session);
            await bootstrapAnonymousStartup(isCurrent);
            if (!isCurrent()) return;
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
            if (!authSessionCoordinator.isCurrent(session)) return;
            session = beginAuthTransition(metadata.address);
            const isCurrent = () =>
              authSessionCoordinator.matches(session, metadata.address);
            await selectWalletStorageForSession(session);
            if (!isCurrent()) return;
            Sentry.setUser({
              id: metadata.address,
            });
            identifyUser(metadata.address);
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
              isCurrent,
            );

            if (!isCurrent()) return;
            set({ isInitializing: false });

            resolveAndCacheAuthUserStatus(
              metadata.address,
              bootstrapResponse,
              isCurrent,
            )
              .then((snapshot) => {
                if (!snapshot || !isCurrent()) return;
                set({
                  hasUsername: snapshot.hasUsername,
                  userLevel: snapshot.userLevel,
                  user: buildUserFromStatus(metadata.address, snapshot),
                });
                updateUserProfile({
                  username: snapshot.username,
                  tier: snapshot.tier,
                });
              })
              .catch((apiError) => {
                if (!isCurrent()) return;
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
                if (!isCurrent()) return;
                addAuthBootstrapBreadcrumb("Logged-in startup bootstrap gating disabled");
                set({ isBootstrapping: false });
              });

            return;
          }
        } catch (error) {
          if (!authSessionCoordinator.isCurrent(session)) return;
          session = beginAuthTransition(null);
          await selectWalletStorageForSession(session);
          if (!authSessionCoordinator.isCurrent(session)) return;
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
        let session = beginAuthTransition(null);
        set({ isCreatingWallet: true });

        try {
          removePersistedQueryCache(getServerIdentity(), get().walletAddress);
          await selectWalletStorageForSession(session);
          const { metadata, mnemonic } =
            await authSessionCoordinator.enqueueIdentityMutation(async () => {
              const metadata = await walletService.createWallet();
              const mnemonic = await walletService.exportMnemonic();
              return { metadata, mnemonic };
            });

          if (!mnemonic) {
            throw new Error(
              "Failed to retrieve mnemonic after wallet creation",
            );
          }

          if (!authSessionCoordinator.isCurrent(session)) return mnemonic;
          session = beginAuthTransition(metadata.address);
          await selectWalletStorageForSession(session);
          if (!authSessionCoordinator.matches(session, metadata.address)) {
            return mnemonic;
          }
          set({
            recoveryPhrase: mnemonic,
            walletAddress: metadata.address,
            publicKeyBase64: metadata.publicKeyBase64,
          });

          return mnemonic;
        } catch (error) {
          if (!authSessionCoordinator.isCurrent(session)) throw error;
          console.error("[AuthStore] Failed to create wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_create" },
          });
          throw error;
        } finally {
          if (authSessionCoordinator.isCurrent(session)) {
            set({ isCreatingWallet: false });
          }
        }
      },

      importWallet: async (mnemonic: string) => {
        let session = beginAuthTransition(null);
        set({ isCreatingWallet: true });

        try {
          removePersistedQueryCache(getServerIdentity(), get().walletAddress);
          await selectWalletStorageForSession(session);
          const metadata = await authSessionCoordinator.enqueueIdentityMutation(() =>
            walletService.importWallet(mnemonic),
          );
          if (!authSessionCoordinator.isCurrent(session)) return;

          session = beginAuthTransition(metadata.address);
          const isCurrent = () =>
            authSessionCoordinator.matches(session, metadata.address);
          await selectWalletStorageForSession(session);
          if (!isCurrent()) return;
          Sentry.setUser({
            id: metadata.address,
          });
          Sentry.addBreadcrumb({
            category: "auth",
            message: "Wallet imported successfully",
            level: "info",
          });
          identifyUser(metadata.address);
          trackEvent("login_completed", { login_method: "wallet_import" });
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
            isCurrent,
          );
          if (!isCurrent()) return;
          const snapshot = await resolveAndCacheAuthUserStatus(
            metadata.address,
            bootstrapResponse,
            isCurrent,
          );

          if (!snapshot || !isCurrent()) return;
          set({
            hasUsername: snapshot.hasUsername,
            userLevel: snapshot.userLevel,
            user: buildUserFromStatus(metadata.address, snapshot),
          });
          updateUserProfile({
            username: snapshot.username,
            tier: snapshot.tier,
          });
        } catch (error) {
          if (!authSessionCoordinator.isCurrent(session)) throw error;
          set({ isBootstrapping: false });
          console.error("[AuthStore] Failed to import wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_import" },
          });
          throw error;
        } finally {
          if (authSessionCoordinator.isCurrent(session)) {
            set({ isCreatingWallet: false, isBootstrapping: false });
          }
        }
      },

      confirmWalletCreation: async () => {
        const { walletAddress, user } = get();

        if (!walletAddress) {
          throw new Error("No wallet to confirm");
        }

        const session = authSessionCoordinator.begin(walletAddress);
        const isCurrent = () =>
          authSessionCoordinator.matches(session, walletAddress);
        walletService.confirmWallet();

        if (!isCurrent()) return;
        identifyUser(walletAddress);
        trackEvent("sign_up_completed", { sign_up_method: "wallet_created" });

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
            if (!isCurrent()) return;
            set({
              hasUsername: snapshot.hasUsername,
              userLevel: snapshot.userLevel,
              user: buildUserFromStatus(walletAddress, snapshot),
            });
          },
          () => {
            if (!isCurrent()) return;
            addAuthBootstrapBreadcrumb("New wallet bootstrap gating disabled");
            set({ isBootstrapping: false });
          },
          isCurrent,
        );
      },

      logout: async () => {
        const outgoingWalletAddress = get().walletAddress;
        const session = beginAuthTransition(null);
        removePersistedQueryCache(getServerIdentity(), outgoingWalletAddress);
        await selectWalletStorageForSession(session);
        try {
          await authSessionCoordinator.enqueueIdentityMutation(async () => {
            const wallet = await walletService.getWallet();
            // Lazy import: push-notifications pulls in the query client and
            // inbox hooks, which import back into stores. A static import here
            // creates a require cycle (auth-store <-> push-notifications).
            const { unregisterPush } = await import("@/src/services/push-notifications");
            await unregisterPush(wallet);
            await walletService.clearWallet();
          });
        } catch (error) {
          if (!authSessionCoordinator.isCurrent(session)) return;
          console.error("[AuthStore] Failed to clear wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_clear" },
          });
        }

        if (!authSessionCoordinator.isCurrent(session)) return;
        Sentry.setUser(null);
        Sentry.addBreadcrumb({
          category: "auth",
          message: "User logged out",
          level: "info",
        });
        resetAnalyticsIdentity();
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
        bootstrapAnonymousAfterLogout(
          () => set({ isBootstrapping: false }),
          () => authSessionCoordinator.isCurrent(session),
        );
      },

      // ============================================
      // State Updates
      // ============================================

      setUser: async (user) => {
        const session = beginAuthTransition(user.walletAddress);
        await selectWalletStorageForSession(session);
        if (!authSessionCoordinator.matches(session, user.walletAddress)) return;
        set({
          user,
          isLoggedIn: true,
          walletAddress: user.walletAddress,
        });
      },

      setUserLevel: (level, walletAddress) => {
        const session = authSessionCoordinator.current();
        if (!authSessionCoordinator.matches(session, walletAddress)) return;
        set({ userLevel: level });

        const tierName = getTierName(level);
        registerTierSuperProperty(tierName);
        updateUserProfile({ tier: tierName });

        const { user } = get();
        if (user) {
          set({
            user: { ...user, tier: tierName },
          });
        }
      },

      setHasUsername: (has, username, expectedWalletAddress) => {
        const session = authSessionCoordinator.current();
        if (!authSessionCoordinator.matches(session, expectedWalletAddress)) return;
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

        if (authSessionCoordinator.isCurrent(session)) {
          walletService.updateMetadata({ hasUsername: has });
        }
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

export function ensureLocallyLoggedOutAfterAccountDeletion(
  deletedWalletAddress: string | null,
): void {
  const state = useAuthStore.getState();
  if (
    !state.isLoggedIn ||
    state.walletAddress?.toLowerCase() !== deletedWalletAddress?.toLowerCase()
  ) {
    return;
  }

  const session = beginAuthTransition(null);
  Sentry.setUser(null);
  resetAnalyticsIdentity();
  useAuthStore.setState({
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
  usePreferencesStore.setState({ hasSeenAdultPrompt: false, ageVerified: false });
  useDraftStore.getState().clearDraft();
  bootstrapAnonymousAfterLogout(
    () => useAuthStore.setState({ isBootstrapping: false }),
    () => authSessionCoordinator.isCurrent(session),
  );
}
