import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import * as Sentry from "@sentry/react-native";
import { isCompletedApiRead, isReadCancellation } from "@/src/api/read-retry-policy";
import { walletService } from "@/src/services/wallet-service";
import { WalletCleanupError } from "@/src/services/wallet-local-session";
import { WalletRecoveryError } from "@/src/services/wallet-secure-transactions";
import { usePreferencesStore } from "./preferences-store";
import { useHomePostCardStore } from "./home-post-card-store";
import { useContentModerationStore } from "./content-moderation-store";
import { useInboxStore } from "./inbox-store";
import { useDraftStore } from "./draft-store";
import { useDeepLinkStore } from "./deep-link-store";
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
  resolveAuthSessionStatus,
  resolvePendingWalletStartup,
  type AuthSessionStatus,
} from "@/src/domain/auth/session";
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
  walletError: string | null;
  // User state
  user: User | null;
  isLoggedIn: boolean;

  // Wallet state
  walletAddress: string | null;
  publicKeyBase64: string | null;
  userLevel: number; // 0 = free, 1 = subscriber, 10 = agent
  hasUsername: boolean;

  // Kept in lockstep with isLoggedIn for older persisted clients.
  hasOnboarded: boolean;
  recoveryPhrase: string | null; // Live only during pending signup

  // Loading state
  isInitializing: boolean;
  isCreatingWallet: boolean;
  isBootstrapping: boolean;

  // Actions - Initialization
  initializeWallet: () => Promise<void>;

  // Actions - Wallet lifecycle
  createNewWallet: () => Promise<string>; // returns mnemonic for display
  importWallet: (mnemonic: string) => Promise<void>;
  confirmWalletCreation: (isDisclosureActive?: () => boolean) => Promise<void>;
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

let walletInitialization: Promise<void> | null = null;

function initializeWalletOnce(initialize: () => Promise<void>): Promise<void> {
  if (!walletInitialization) {
    walletInitialization = initialize().finally(() => { walletInitialization = null; });
  }
  return walletInitialization;
}

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
      walletError: null,

      // ============================================
      // Initialization
      // ============================================

      initializeWallet: () => initializeWalletOnce(async () => {
        if (!get().isInitializing && !get().walletError) return;
        if (USE_MOCK_USER) {
          set({ isInitializing: false });
          return;
        }

        let session = beginAuthTransition(null);
        try {
          set({ isInitializing: true, isLoggedIn: false, walletError: null });

          await walletService.migrateKeychainAccessibility();
          if (!authSessionCoordinator.isCurrent(session)) return;

          const pendingMetadata = walletService.getWalletMetadata();
          const pendingStartup = resolvePendingWalletStartup(pendingMetadata);
          if (pendingStartup === "resume" && pendingMetadata) {
            const mnemonic = await walletService.exportMnemonic();
            if (!authSessionCoordinator.isCurrent(session)) return;
            if (!mnemonic) {
              Sentry.captureMessage("Pending signup wallet is missing its mnemonic", {
                level: "error",
                tags: { feature: "auth", operation: "resume-pending-signup" },
              });
            }
            session = beginAuthTransition(pendingMetadata.address);
            await selectWalletStorageForSession(session);
            if (!authSessionCoordinator.isCurrent(session)) return;
            set({
              isLoggedIn: false,
              hasOnboarded: false,
              isBootstrapping: false,
              walletAddress: pendingMetadata.address,
              publicKeyBase64: pendingMetadata.publicKeyBase64,
              hasUsername: pendingMetadata.signup?.phase === "confirmed",
              recoveryPhrase: mnemonic,
              user: {
                id: pendingMetadata.address,
                username: null,
                walletAddress: pendingMetadata.address,
                tier: "Free",
              },
              isInitializing: false,
            });
            return;
          }

          const hasWalletResult = await walletService.hasWallet();
          if (!authSessionCoordinator.isCurrent(session)) return;

          if (!hasWalletResult) {
            await selectWalletStorageForSession(session);
            const isCurrent = () => authSessionCoordinator.isCurrent(session);
            if (!isCurrent()) return;
            set({
              isLoggedIn: false,
              walletAddress: null,
              publicKeyBase64: null,
              hasOnboarded: false,
              isInitializing: false,
              user: null,
              recoveryPhrase: null,
              hasUsername: false,
              userLevel: 0,
            });
            void bootstrapAnonymousStartup(isCurrent).catch((error) => {
              if (isCurrent()) Sentry.captureException(error);
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
              isInitializing: false,
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

            void bootstrapAuthSession(
              metadata.address,
              "Logged-in startup",
              isCurrent,
            ).then((bootstrapResponse) => resolveAndCacheAuthUserStatus(
              metadata.address,
              bootstrapResponse,
              isCurrent,
            ))
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
                Sentry.addBreadcrumb({
                  category: "auth",
                  message: "Failed to fetch user status",
                  level: "warning",
                });
                if (!isCompletedApiRead(apiError) && !isReadCancellation(apiError)) Sentry.captureException(apiError, {
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
          walletService.invalidateSession();
          set({
            isLoggedIn: false, user: null, recoveryPhrase: null,
            walletAddress: null, publicKeyBase64: null, hasOnboarded: false,
            hasUsername: false, userLevel: 0, isInitializing: false,
            isBootstrapping: false,
            walletError: error instanceof Error ? error.message : "Wallet recovery is required. Retry on this device.",
          });
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
      }),

      // ============================================
      // Wallet Creation & Import
      // ============================================

      createNewWallet: async () => {
        if (get().isInitializing) throw new Error("Wait for local wallet restoration before creating a wallet");
        if (get().isCreatingWallet) throw new Error("Wallet operation already running");
        if (walletService.getWalletMetadata()) throw new Error("Resume the existing wallet instead of generating a new key");
        let session = beginAuthTransition(null);
        set({ isCreatingWallet: true });

        try {
          removePersistedQueryCache(getServerIdentity(), get().walletAddress);
          await selectWalletStorageForSession(session);
          const { metadata, mnemonic } =
            await authSessionCoordinator.enqueueIdentityMutation(async () => {
              if (!authSessionCoordinator.isCurrent(session)) throw new Error("Wallet session changed");
              const metadata = await walletService.createWallet();
              const mnemonic = await walletService.exportMnemonic();
              return { metadata, mnemonic };
            });

          if (!mnemonic) {
            throw new Error(
              "Failed to retrieve mnemonic after wallet creation",
            );
          }

          if (!authSessionCoordinator.isCurrent(session)) throw new Error("Wallet session changed");
          session = beginAuthTransition(metadata.address);
          await selectWalletStorageForSession(session);
          if (!authSessionCoordinator.matches(session, metadata.address)) {
            throw new Error("Wallet session changed");
          }
          set({
            recoveryPhrase: mnemonic,
            isLoggedIn: false,
            hasOnboarded: false,
            hasUsername: false,
            walletAddress: metadata.address,
            publicKeyBase64: metadata.publicKeyBase64,
          });

          return mnemonic;
        } catch (error) {
          if (!authSessionCoordinator.isCurrent(session)) throw error;
          if (error instanceof WalletRecoveryError || error instanceof WalletCleanupError) {
            walletService.invalidateSession();
            set({
              isLoggedIn: false, user: null, walletAddress: null, publicKeyBase64: null,
              recoveryPhrase: null, hasOnboarded: false, hasUsername: false,
              userLevel: 0, walletError: error.message,
            });
          }
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
        if (get().isInitializing) throw new Error("Wait for local wallet restoration before importing a wallet");
        if (get().isCreatingWallet) throw new Error("Wallet operation already running");
        if (walletService.getWalletMetadata()?.pending) {
          throw new Error("Resume the pending signup before replacing this recovery key");
        }
        const previousAddress = get().isLoggedIn ? get().walletAddress : null;
        if (previousAddress) useDeepLinkStore.getState().setPendingRoute(null);
        let committed = false;
        let session = beginAuthTransition(null);
        set({ isCreatingWallet: true });

        try {
          removePersistedQueryCache(getServerIdentity(), get().walletAddress);
          await selectWalletStorageForSession(session);
          const metadata = await authSessionCoordinator.enqueueIdentityMutation(() => {
            if (!authSessionCoordinator.isCurrent(session)) throw new Error("Wallet session changed");
            return walletService.importWallet(mnemonic);
          });
          committed = true;
          if (!authSessionCoordinator.isCurrent(session)) throw new Error("Wallet session changed");

          session = beginAuthTransition(metadata.address);
          const isCurrent = () =>
            authSessionCoordinator.matches(session, metadata.address);
          await selectWalletStorageForSession(session);
          if (!isCurrent()) throw new Error("Wallet session changed");
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
            recoveryPhrase: null,
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
          if (!isCurrent()) throw new Error("Wallet session changed");
          const snapshot = await resolveAndCacheAuthUserStatus(
            metadata.address,
            bootstrapResponse,
            isCurrent,
          );

          if (!isCurrent()) throw new Error("Wallet session changed");
          if (!snapshot) return;
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
          if (error instanceof WalletRecoveryError || error instanceof WalletCleanupError) {
            walletService.invalidateSession();
            set({
              isLoggedIn: false, user: null, walletAddress: null, publicKeyBase64: null,
              recoveryPhrase: null, hasOnboarded: false, hasUsername: false,
              userLevel: 0, walletError: error.message,
            });
          }
          if (!committed && previousAddress && !(error instanceof WalletRecoveryError) && !(error instanceof WalletCleanupError)) {
            const retainedWallet = await walletService.getWallet();
            if (!authSessionCoordinator.isCurrent(session)) throw error;
            if (retainedWallet?.address === previousAddress) {
              session = beginAuthTransition(previousAddress);
              await selectWalletStorageForSession(session);
              if (!authSessionCoordinator.isCurrent(session)) throw error;
            }
          }
          set({ isBootstrapping: false });
          addAuthBootstrapBreadcrumb("Wallet import status unavailable");
          if (!isCompletedApiRead(error) && !isReadCancellation(error)) {
            Sentry.captureException(error, { tags: { action: "wallet_import" } });
          }
          throw error;
        } finally {
          if (authSessionCoordinator.isCurrent(session)) {
            set({ isCreatingWallet: false, isBootstrapping: false });
          }
        }
      },

      confirmWalletCreation: async (isDisclosureActive = () => true) => {
        const { walletAddress, user, hasUsername, isLoggedIn } = get();

        if (!walletAddress || !hasUsername || isLoggedIn || !isDisclosureActive()) {
          throw new Error("No wallet to confirm");
        }

        const session = authSessionCoordinator.current();
        const isCurrent = () =>
          authSessionCoordinator.matches(session, walletAddress);
        if (!isCurrent()) throw new Error("Wallet session changed");
        const wallet = await walletService.getWallet();
        if (!isCurrent() || !isDisclosureActive() || wallet?.address !== walletAddress) throw new Error("Wallet session changed");
        walletService.confirmWallet(walletAddress);

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
        useDeepLinkStore.getState().setPendingRoute(null);
        const outgoingWalletAddress = get().walletAddress;
        let cleanupError: unknown;
        let outgoingWallet: ReturnType<typeof walletService.prepareCleanup> = null;
        try {
          outgoingWallet = walletService.prepareCleanup();
        } catch {
          cleanupError = new WalletCleanupError();
        }
        const session = authSessionCoordinator.begin(null);
        try {
          set({
            user: null, isLoggedIn: false, walletAddress: null, publicKeyBase64: null,
            userLevel: 0, hasUsername: false, hasOnboarded: false, recoveryPhrase: null,
            isInitializing: false, isCreatingWallet: false, isBootstrapping: false,
            walletError: null,
          });
          clearWalletScopedState();
          removePersistedQueryCache(getServerIdentity(), outgoingWalletAddress);
          await selectWalletStorageForSession(session);
        } catch {
          cleanupError = new WalletCleanupError();
        }
        try {
          await authSessionCoordinator.enqueueIdentityMutation(async () => {
            const cleanup = walletService.clearWallet();
            // Keep push cleanup in the identity queue, but never delay key deletion.
            const unregister = outgoingWallet
              ? import("@/src/services/push-notifications")
                .then(({ unregisterPush }) => unregisterPush(outgoingWallet))
                .catch((error) => { Sentry.captureException(error); })
              : Promise.resolve();
            const [result] = await Promise.allSettled([cleanup, unregister]);
            outgoingWallet = null;
            if (result.status === "rejected") throw result.reason;
          });
        } catch (error) {
          cleanupError = error instanceof WalletCleanupError ? error : new WalletCleanupError();
          console.error("[AuthStore] Failed to clear wallet:", error);
          Sentry.captureException(error, {
            tags: { action: "wallet_clear" },
          });
        }

        if (!authSessionCoordinator.isCurrent(session)) {
          if (cleanupError) throw cleanupError;
          return;
        }
        Sentry.setUser(null);
        Sentry.addBreadcrumb({
          category: "auth",
          message: cleanupError ? "Local logout; device cleanup requires retry" : "User logged out",
          level: "info",
        });
        resetAnalyticsIdentity();
        try {
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
            walletError: cleanupError instanceof Error ? cleanupError.message : null,
          });
        } catch {
          throw new WalletCleanupError();
        }

        useHomePostCardStore.getState().reset();
        useContentModerationStore.getState().clearAll();
        useInboxStore.getState().resetForLogout();
        usePreferencesStore.setState({ ageVerified: false });
        useDraftStore.getState().clearDraft();
        bootstrapAnonymousAfterLogout(
          () => set({ isBootstrapping: false }),
          () => authSessionCoordinator.isCurrent(session),
        );
        if (cleanupError) throw cleanupError;
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
          isLoggedIn: false,
          walletAddress: null,
          publicKeyBase64: null,
          hasOnboarded: false,
        };
      },
    },
  ),
);

// ============================================
// Selectors (for performance optimization)
// ============================================

export function selectAuthSessionStatus(state: {
  isLoggedIn: boolean;
  walletAddress: string | null;
  recoveryPhrase: string | null;
}): AuthSessionStatus {
  return resolveAuthSessionStatus({
    hasConfirmedSession: state.isLoggedIn,
    hasPendingWallet:
      !state.isLoggedIn && !!state.walletAddress && !!state.recoveryPhrase,
    walletAddress: state.walletAddress,
  });
}

export const useAuthSessionStatus = () => useAuthStore(selectAuthSessionStatus);
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

  let walletError: string | null = null;
  try {
    walletService.prepareCleanup();
  } catch {
    walletError = new WalletCleanupError().message;
  }
  const session = authSessionCoordinator.begin(null);
  void authSessionCoordinator.enqueueIdentityMutation(() => walletService.clearWallet())
    .catch((error) => {
      Sentry.captureException(error);
      if (authSessionCoordinator.isCurrent(session)) {
        useAuthStore.setState({ walletError: new WalletCleanupError().message });
      }
    });
  Sentry.setUser(null);
  resetAnalyticsIdentity();
  useAuthStore.setState({
    walletError,
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
  clearWalletScopedState();
  useHomePostCardStore.getState().reset();
  useContentModerationStore.getState().clearAll();
  useInboxStore.getState().resetForLogout();
  usePreferencesStore.setState({ ageVerified: false });
  useDraftStore.getState().clearDraft();
  bootstrapAnonymousAfterLogout(
    () => useAuthStore.setState({ isBootstrapping: false }),
    () => authSessionCoordinator.isCurrent(session),
  );
}
