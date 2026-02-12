import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import { walletService } from "@/src/services/wallet-service";
import { getUserStatus } from "@/src/api/read/endpoints/users";
import type { WalletMetadata } from "@/src/wallet";
import { useHomePostCardStore } from "@/src/pages/home/home-post-card-store";
import { useContentModerationStore } from "./content-moderation-store";

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
  tier: "Premium",
  avatar: undefined,
  followerCount: 128,
};

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
  userLevel: number; // 0 = free, 1-3 = paid tiers
  hasUsername: boolean;

  // Onboarding state
  hasOnboarded: boolean;
  recoveryPhrase: string | null; // Temporarily stored during onboarding flow

  // Loading state
  isInitializing: boolean;
  isCreatingWallet: boolean;

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
  setHasUsername: (has: boolean) => void;
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

          const cleanedUp = await walletService.cleanupPendingWallet();
          if (cleanedUp) {
            console.log("[AuthStore] Cleaned up pending wallet from incomplete signup");
          }

          const hasWallet = await walletService.hasWallet();

          if (!hasWallet) {
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
            set({
              isLoggedIn: true,
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
              isInitializing: false,
            });

            getUserStatus({ address: metadata.address })
              .then((userStatus) => {
                const tierNames = ["Free", "Basic", "Premium", "Pro"];
                const newUserLevel = userStatus.user_level;
                const newHasUsername = !!userStatus.username;
                const newTier = tierNames[userStatus.user_level] || "Free";

                if (userStatus.username) {
                  walletService.updateMetadata({ hasUsername: true });
                }

                set({
                  hasUsername: newHasUsername,
                  userLevel: newUserLevel,
                  user: {
                    id: metadata.address,
                    username: userStatus.username,
                    walletAddress: metadata.address,
                    tier: newTier,
                  },
                });
              })
              .catch((apiError) => {
                console.warn("[AuthStore] Failed to fetch user status from API:", apiError);
              });

            return;
          }
        } catch (error) {
          console.error("[AuthStore] Failed to initialize wallet:", error);
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
            throw new Error("Failed to retrieve mnemonic after wallet creation");
          }

          set({
            recoveryPhrase: mnemonic,
            walletAddress: metadata.address,
            publicKeyBase64: metadata.publicKeyBase64,
          });

          return mnemonic;
        } catch (error) {
          console.error("[AuthStore] Failed to create wallet:", error);
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

          set({
            isLoggedIn: true,
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
        } catch (error) {
          console.error("[AuthStore] Failed to import wallet:", error);
          throw error;
        } finally {
          set({ isCreatingWallet: false });
        }
      },

      confirmWalletCreation: async () => {
        const { walletAddress, publicKeyBase64 } = get();

        if (!walletAddress) {
          throw new Error("No wallet to confirm");
        }

        walletService.confirmWallet();

        set({
          isLoggedIn: true,
          hasOnboarded: true,
          recoveryPhrase: null,
          user: {
            id: walletAddress,
            username: null,
            walletAddress,
            tier: "Free",
          },
        });
      },

      logout: async () => {
        try {
          await walletService.clearWallet();
        } catch (error) {
          console.error("[AuthStore] Failed to clear wallet:", error);
        }

        set({
          user: null,
          isLoggedIn: false,
          walletAddress: null,
          publicKeyBase64: null,
          userLevel: 0,
          hasUsername: false,
          hasOnboarded: false,
          recoveryPhrase: null,
        });

        useHomePostCardStore.getState().reset();
        useContentModerationStore.getState().clearAll();
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
          const tierNames = ["Free", "Basic", "Premium", "Pro"];
          set({
            user: { ...user, tier: tierNames[level] || "Free" },
          });
        }
      },

      setHasUsername: (has) => {
        set({ hasUsername: has });

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
    }
  )
);

// ============================================
// Selectors (for performance optimization)
// ============================================

export const useIsLoggedIn = () => useAuthStore((s) => s.isLoggedIn);
export const useWalletAddress = () => useAuthStore((s) => s.walletAddress);
export const useUserLevel = () => useAuthStore((s) => s.userLevel);
export const useHasUsername = () => useAuthStore((s) => s.hasUsername);
export const useIsInitializing = () => useAuthStore((s) => s.isInitializing);
