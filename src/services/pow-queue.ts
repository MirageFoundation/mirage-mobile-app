/**
 * POW Action Queue Service
 *
 * Centralizes all Proof-of-Work operations into a single sequential queue.
 * This prevents crashes from running multiple POW computations in parallel
 * (the native module only supports one at a time).
 *
 * Features:
 * - Sequential execution of POW-requiring actions
 * - Single unified toast showing queue progress (e.g., "1/3 Upvoting...")
 * - Background processing - users can continue using the app
 * - Per-action success/failure callbacks
 * - Automatic retry support (optional)
 * - Instant cancel via Promise.race token (no waiting for native module)
 */

import { create } from "zustand";
import { AppState, InteractionManager } from "react-native";
import * as Sentry from "@sentry/react-native";
import * as Network from "expo-network";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";
import { canSkipPoWForUser } from "@/src/utils/pow-eligibility";
import { cancelPow, isPowCancelled } from "@/src/wallet";
import { useAuthStore } from "@/src/stores/auth-store";

export type PowActionType =
  | "upvote"
  | "downvote"
  | "remove_vote"
  | "post"
  | "comment"
  | "edit"
  | "delete"
  | "follow"
  | "unfollow"
  | "block"
  | "unblock"
  | "report"
  | "annotate";

const CONTENT_LOSS_TYPES: Set<PowActionType> = new Set(["comment", "post", "edit", "annotate"]);

export interface PowAction<T = unknown> {
  id: string;
  type: PowActionType;
  label: string;
  showProgress?: boolean;
  forcePoW?: boolean;
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  onOptimisticUpdate?: () => void;
  onRollback?: () => void;
}

export interface PowQueueState {
  queue: PowAction[];
  currentAction: PowAction | null;
  isProcessing: boolean;
  completedCount: number;
  totalCount: number;
  currentProgress: number;
  lastError: Error | null;
 lastCompletedAction: { type: PowActionType; success: boolean; errorMessage?: string; skippedPoW?: boolean } | null;
  successOverlay: { type: PowActionType; success: boolean; errorMessage?: string; skippedPoW?: boolean } | null;
}

export interface PowQueueActions {
  enqueue: <T>(action: PowAction<T>) => void;
  processNext: () => Promise<void>;
  updateProgress: (progress: number) => void;
  clear: () => void;
  reset: () => void;
  continueProcessing: () => void;
  cancelAction: (actionId: string) => boolean;
}

type PowQueueStore = PowQueueState & PowQueueActions;

const NATIVE_CLEANUP_TIMEOUT_MS = 500;
const SUCCESS_OVERLAY_DURATION_MS = 500;
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_BACKOFF_MS = 2000;
const PAUSED_SENTINEL = "pow_paused";
const STALE_BLOCK_HASH_CODES = new Set([
  "invalid_last_block_hash",
  "insufficient_pow_precheck",
]);

let actionIdCounter = 0;

export const generateActionId = (): string => {
  actionIdCounter += 1;
  return `pow-${actionIdCounter}-${Date.now()}`;
};

export const getActionLabel = (type: PowActionType): string => {
  switch (type) {
    case "upvote":
      return "Upvoting";
    case "downvote":
      return "Downvoting";
    case "remove_vote":
      return "Removing vote";
    case "post":
      return "Creating post";
    case "comment":
      return "Adding comment";
    case "edit":
      return "Editing";
    case "delete":
      return "Deleting";
    case "follow":
      return "Following";
    case "unfollow":
      return "Unfollowing";
    case "block":
      return "Blocking";
    case "unblock":
      return "Unblocking";
    case "report":
      return "Reporting";
    case "annotate":
      return "Annotating";
    default:
      return "Processing";
  }
};

export const getSuccessLabel = (type: PowActionType): string => {
  switch (type) {
    case "upvote":
      return "Upvoted";
    case "downvote":
      return "Downvoted";
    case "remove_vote":
      return "Vote removed";
    case "post":
      return "Post created";
    case "comment":
      return "Comment added";
    case "edit":
      return "Edited";
    case "delete":
      return "Deleted";
    case "follow":
      return "Followed";
    case "unfollow":
      return "Unfollowed";
    case "block":
      return "Blocked";
    case "unblock":
      return "Unblocked";
    case "report":
      return "Reported";
    case "annotate":
      return "Annotated";
    default:
      return "Done";
  }
};

let isProcessingLock = false;
let currentCancelReject: ((reason?: unknown) => void) | null = null;
let successOverlayTimeout: ReturnType<typeof setTimeout> | null = null;

const immediateActions = new Map<
  string,
  { reject: (reason?: unknown) => void; action: PowAction }
>();

let isPausedByAppState = AppState.currentState !== "active";
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;

const isNetworkError = (error: unknown): boolean =>
  (error as any)?.code === "ERR_NETWORK" ||
  (error as any)?.message === "Network Error";

const isStaleBlockHashError = (error: unknown): boolean => {
  const code = (error as any)?.response?.data?.error_code;
  if (typeof code === "string" && STALE_BLOCK_HASH_CODES.has(code)) return true;
  const msg = String((error as Error)?.message || "");
  return /invalid\s*last\s*block\s*hash/i.test(msg);
};


function setupPowQueueAppStateHandling(): void {
  if (appStateSubscription) return;
  isPausedByAppState = AppState.currentState !== "active";
  appStateSubscription = AppState.addEventListener("change", (nextState) => {
    if (nextState.match(/inactive|background/)) {
      if (isPausedByAppState) return;
      isPausedByAppState = true;
      Sentry.addBreadcrumb({
        category: "pow",
        message: "App backgrounded, pausing PoW queue",
        level: "info",
      });
      // Tear down the currently-running PoW computation. The action will be
      // re-prepended to the queue from the catch block in processNext.
      try {
        cancelPow();
      } catch {}
      if (currentCancelReject) {
        currentCancelReject(new Error(PAUSED_SENTINEL));
        currentCancelReject = null;
      }
      // Same for any in-flight skip-PoW actions.
      immediateActions.forEach(({ reject }) => {
        reject(new Error(PAUSED_SENTINEL));
      });
      immediateActions.clear();
    } else if (nextState === "active") {
      if (!isPausedByAppState) return;
      isPausedByAppState = false;
      Sentry.addBreadcrumb({
        category: "pow",
        message: "App foregrounded, resuming PoW queue",
        level: "info",
      });
      const store = usePowQueueStore.getState();
      if (
        !isProcessingLock &&
        !store.currentAction &&
        store.queue.length > 0
      ) {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => usePowQueueStore.getState().processNext(), 16);
        });
      }
    }
  });
}

const waitForConnectivity = (): Promise<void> => {
  return new Promise((resolve) => {
    const check = async () => {
      const appActive = AppState.currentState === "active";
      const net = await Network.getNetworkStateAsync();
      if (appActive && net.isConnected) {
        resolve();
        return;
      }
      const subs: { remove: () => void }[] = [];
      const cleanup = () => subs.forEach((s) => s.remove());
      const recheck = async () => {
        const a = AppState.currentState === "active";
        const n = await Network.getNetworkStateAsync();
        if (a && n.isConnected) {
          cleanup();
          resolve();
        }
      };
      subs.push(AppState.addEventListener("change", () => recheck()));
      const interval = setInterval(async () => {
        await recheck();
        if (AppState.currentState === "active") {
          const n = await Network.getNetworkStateAsync();
          if (n.isConnected) clearInterval(interval);
        }
      }, 3000);
      subs.push({ remove: () => clearInterval(interval) });
    };
    check();
  });
};

const executeWithNetworkRetry = async <T>(
  fn: () => Promise<T>,
  cancelPromise: Promise<never>,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const result = await Promise.race([fn(), cancelPromise]);
      return result;
    } catch (error) {
      const msg = String((error as Error)?.message || "");
      if (msg === "pow_cancelled" || isPowCancelled(error)) throw error;
      if (msg === PAUSED_SENTINEL) throw error;
      const stale = isStaleBlockHashError(error);
      const net = isNetworkError(error);
      if (!stale && !net) throw error;
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES) {
        Sentry.addBreadcrumb({
          category: "pow",
          message: stale
            ? `Stale block hash, retrying with fresh params (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})`
            : `Network error, waiting for connectivity (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})`,
          level: "warning",
        });
        await waitForConnectivity();
        await new Promise((r) => setTimeout(r, NETWORK_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }
  throw lastError;
};

const executeImmediately = async <T>(action: PowAction<T>): Promise<void> => {
  let cancelReject: (reason?: unknown) => void = () => {};
  const cancelPromise = new Promise<never>((_, reject) => {
    cancelReject = reject;
  });
  cancelPromise.catch(() => {});
  immediateActions.set(action.id, { reject: cancelReject, action: action as PowAction });

  try {
    const result = await executeWithNetworkRetry(action.execute, cancelPromise);

    if (!immediateActions.has(action.id)) {
      return;
    }

    action.onSuccess?.(result);
    usePowQueueStore.setState({
      lastError: null,
      lastCompletedAction: { type: action.type, success: true, skippedPoW: true },
      successOverlay: { type: action.type, success: true, skippedPoW: true },
    });

    if (successOverlayTimeout) clearTimeout(successOverlayTimeout);
    successOverlayTimeout = setTimeout(() => {
      usePowQueueStore.setState({ successOverlay: null, lastCompletedAction: null });
      successOverlayTimeout = null;
    }, SUCCESS_OVERLAY_DURATION_MS);

    Sentry.addBreadcrumb({
      category: "pow",
      message: `${action.type} completed immediately without PoW`,
      level: "info",
      data: { actionId: action.id, type: action.type },
    });
  } catch (error) {
    const msg = String((error as Error)?.message || "");
    if (msg === "pow_cancelled" || isPowCancelled(error)) {
      return;
    }
    if (msg === PAUSED_SENTINEL) {
      // App went to background mid-flight: re-enqueue as a regular queued action
      // so it gets retried (with a fresh signed envelope) when we come back.
      Sentry.addBreadcrumb({
        category: "pow",
        message: `${action.type} paused (app backgrounded), will resume`,
        level: "info",
        data: { actionId: action.id, type: action.type },
      });
      const state = usePowQueueStore.getState();
      usePowQueueStore.setState({
        queue: [action as PowAction, ...state.queue],
      });
      return;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    if (!isNetworkError(error)) {
      Sentry.captureException(err, {
        tags: { action: "pow_action_immediate", pow_type: action.type },
        extra: { actionId: action.id, label: action.label },
      });
    }
    action.onRollback?.();
    action.onError?.(err);
    usePowQueueStore.setState({
      lastError: err,
      lastCompletedAction: {
        type: action.type,
        success: false,
        errorMessage: isNetworkError(error) ? "No internet connection" : getApiErrorMessage(error),
        skippedPoW: true,
      },
      successOverlay: {
        type: action.type,
        success: false,
        errorMessage: isNetworkError(error) ? "No internet connection" : getApiErrorMessage(error),
        skippedPoW: true,
      },
    });

    if (successOverlayTimeout) clearTimeout(successOverlayTimeout);
    successOverlayTimeout = setTimeout(() => {
      usePowQueueStore.setState({ successOverlay: null, lastCompletedAction: null });
      successOverlayTimeout = null;
    }, SUCCESS_OVERLAY_DURATION_MS);
  } finally {
    immediateActions.delete(action.id);
  }
};

export const usePowQueueStore = create<PowQueueStore>((set, get) => ({
  queue: [],
  currentAction: null,
  isProcessing: false,
  completedCount: 0,
  totalCount: 0,
  currentProgress: 0,
 lastError: null,
 lastCompletedAction: null,
  successOverlay: null,

  enqueue: <T>(action: PowAction<T>) => {
    action.onOptimisticUpdate?.();

    const { userLevel, user } = useAuthStore.getState();
    if (!action.forcePoW && canSkipPoWForUser(userLevel, user?.tier)) {
      void executeImmediately(action);
      return;
    }

    const state = get();
    const needsKick = !isProcessingLock && !state.currentAction;
    const showProgress = action.showProgress !== false;

    set({
      queue: [...state.queue, action as PowAction],
      totalCount: state.totalCount + (showProgress ? 1 : 0),
      isProcessing: true,
    });

    if (needsKick) {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => get().processNext(), 16);
      });
    }
  },

  cancelAction: (actionId: string): boolean => {
    const immediateEntry = immediateActions.get(actionId);
    if (immediateEntry) {
      immediateActions.delete(actionId);
      immediateEntry.reject(new Error("pow_cancelled"));
      return true;
    }

    const state = get();

    if (state.currentAction?.id === actionId) {
      cancelPow();

      if (currentCancelReject) {
        currentCancelReject(new Error("pow_cancelled"));
        currentCancelReject = null;
      }

      set({
        currentAction: null,
        currentProgress: 0,
        isProcessing: state.queue.length > 0,
        totalCount: Math.max(
          0,
          state.totalCount - (state.currentAction.showProgress === false ? 0 : 1)
        ),
        lastCompletedAction: null,
      });
      return true;
    }

    const idx = state.queue.findIndex((a) => a.id === actionId);
    if (idx !== -1) {
      const newQueue = [...state.queue];
      const action = newQueue[idx];
      newQueue.splice(idx, 1);
      set({
        queue: newQueue,
        totalCount: Math.max(
          0,
          state.totalCount - (action?.showProgress === false ? 0 : 1)
        ),
        isProcessing: newQueue.length > 0 || state.currentAction !== null,
      });
      return true;
    }

    return false;
  },

  processNext: async () => {
    if (isProcessingLock) {
      return;
    }

    const state = get();

    if (state.currentAction) {
      return;
    }

    if (state.queue.length === 0) {
      set({
        isProcessing: false,
        currentAction: null,
        currentProgress: 0,
      });

      setTimeout(() => {
        const currentState = get();
        if (!currentState.isProcessing && currentState.queue.length === 0) {
          set({
            completedCount: 0,
            totalCount: 0,
            lastCompletedAction: null,
          });
        }
      }, 2000);
      return;
    }

    // Don't start a new action while the app is backgrounded — PoW workers
    // will be suspended, the signed envelope's last_block_hash will go stale,
    // and the network round-trip will fail with `invalid_last_block_hash`.
    // We'll be re-kicked by the AppState 'active' subscription.
    if (isPausedByAppState || AppState.currentState !== "active") {
      set({ isProcessing: true });
      return;
    }

    isProcessingLock = true;

    const [nextAction, ...remainingQueue] = state.queue;

   set({
     currentAction: nextAction,
     queue: remainingQueue,
     currentProgress: 0,
   });

    let wasCancelled = false;
    let executePromise: Promise<unknown> | null = null;

    const cancelPromise = new Promise<never>((_, reject) => {
      currentCancelReject = reject;
    });
    cancelPromise.catch(() => {});

    try {
      const result = await executeWithNetworkRetry(
        () => {
          executePromise = nextAction.execute();
          return executePromise;
        },
        cancelPromise,
      );

      currentCancelReject = null;
    nextAction.onSuccess?.(result);

    Sentry.addBreadcrumb({
      category: "pow",
      message: `${nextAction.type} completed successfully`,
      level: "info",
      data: { actionId: nextAction.id, type: nextAction.type },
    });
    if (nextAction.showProgress !== false) {
      set((s) => ({
        completedCount: s.completedCount + 1,
        lastError: null,
        lastCompletedAction: { type: nextAction.type, success: true },
        successOverlay: { type: nextAction.type, success: true },
      }));

      if (successOverlayTimeout) clearTimeout(successOverlayTimeout);
      successOverlayTimeout = setTimeout(() => {
        set({ successOverlay: null });
        successOverlayTimeout = null;
      }, SUCCESS_OVERLAY_DURATION_MS);
    } else {
      set({ lastError: null });
    }
    } catch (error) {
      currentCancelReject = null;

      const msg = String((error as Error)?.message || "");
      if (msg === PAUSED_SENTINEL) {
        // App went to background while this action was in flight.
        // Re-prepend it to the queue so we retry from scratch (with a fresh
        // last_block_hash) once we're foregrounded again. The optimistic UI
        // update was already applied at enqueue time, so we deliberately
        // skip onRollback/onError here.
        wasCancelled = true;
        Sentry.addBreadcrumb({
          category: "pow",
          message: `${nextAction.type} paused (app backgrounded), will resume`,
          level: "info",
          data: { actionId: nextAction.id, type: nextAction.type },
        });
        set((s) => ({
          queue: [nextAction, ...s.queue],
          currentAction: null,
          currentProgress: 0,
        }));
      } else if (msg === "pow_cancelled" || isPowCancelled(error)) {
        wasCancelled = true;
        if (CONTENT_LOSS_TYPES.has(nextAction.type)) {
          Sentry.captureException(
            new Error(`PoW cancelled during ${nextAction.type}`),
            {
              level: "warning",
              tags: { action: "pow_cancelled", pow_type: nextAction.type },
              extra: { actionId: nextAction.id, label: nextAction.label },
            },
          );
        }
        nextAction.onRollback?.();
      } else {
        const err = error instanceof Error ? error : new Error(String(error));
        const displayMsg = isNetworkError(error)
          ? "No internet connection"
          : getApiErrorMessage(error);
        if (!isNetworkError(error) && !isPowCancelled(error)) {
          Sentry.captureException(err, {
            tags: { action: "pow_action", pow_type: nextAction.type },
            extra: { actionId: nextAction.id, label: nextAction.label },
          });
        }
        nextAction.onRollback?.();
        nextAction.onError?.(err);

       if (nextAction.showProgress !== false) {
         set((s) => ({
           completedCount: s.completedCount + 1,
           lastError: err,
           lastCompletedAction: { type: nextAction.type, success: false, errorMessage: displayMsg },
           successOverlay: { type: nextAction.type, success: false, errorMessage: displayMsg },
         }));

         if (successOverlayTimeout) clearTimeout(successOverlayTimeout);
         successOverlayTimeout = setTimeout(() => {
           set({ successOverlay: null });
           successOverlayTimeout = null;
         }, SUCCESS_OVERLAY_DURATION_MS);
       } else {
         set({ lastError: err });
       }
      }
    } finally {
      if (wasCancelled) {
        const nativeCleanup = executePromise
          ? (executePromise as Promise<unknown>).catch(() => {})
          : Promise.resolve();
        const maxWait = new Promise((r) =>
          setTimeout(r, NATIVE_CLEANUP_TIMEOUT_MS)
        );

        Promise.race([nativeCleanup, maxWait]).then(() => {
          isProcessingLock = false;
          get().processNext();
        });
    } else {
       isProcessingLock = false;
       set({ currentAction: null, currentProgress: 0 });
       get().processNext();
     }
    }
  },

  continueProcessing: () => {
    get().processNext();
  },

  updateProgress: (progress: number) => {
    set({ currentProgress: progress });
  },

  clear: () => {
    const state = get();
    state.queue.forEach((action) => action.onRollback?.());

    set({
      queue: [],
      totalCount: state.completedCount,
    });
  },

  reset: () => {
    isProcessingLock = false;
    currentCancelReject = null;
    immediateActions.forEach(({ reject }) => reject(new Error("pow_cancelled")));
    immediateActions.clear();
    set({
      queue: [],
      currentAction: null,
      isProcessing: false,
      completedCount: 0,
      totalCount: 0,
     currentProgress: 0,
     lastError: null,
     lastCompletedAction: null,
     successOverlay: null,
   });
  },
}));

export function waitForQueueDrain(): Promise<void> {
 const state = usePowQueueStore.getState();
 if (!state.isProcessing && state.queue.length === 0 && !state.currentAction) {
  return Promise.resolve();
 }
 return new Promise<void>((resolve) => {
  const unsub = usePowQueueStore.subscribe((s) => {
   if (!s.isProcessing && s.queue.length === 0 && !s.currentAction) {
    unsub();
    resolve();
   }
  });
 });
}

export const usePowQueue = () => {
  const store = usePowQueueStore();

  return {
    enqueue: store.enqueue,
    cancelAction: store.cancelAction,
    clear: store.clear,
    reset: store.reset,
    isProcessing: store.isProcessing,
    currentAction: store.currentAction,
    queueLength: store.queue.length,
    completedCount: store.completedCount,
    totalCount: store.totalCount,
    currentProgress: store.currentProgress,
   pendingCount: store.queue.length + (store.currentAction ? 1 : 0),
   lastCompletedAction: store.lastCompletedAction,
   successOverlay: store.successOverlay,
 };
};

// Wire up app-foreground/background pause-resume for the PoW queue.
// This must run after the store is defined.
setupPowQueueAppStateHandling();
