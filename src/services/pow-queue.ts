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
import { cancelPow, isPowCancelled } from "@/src/wallet";

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

export interface PowAction<T = unknown> {
  id: string;
  type: PowActionType;
  label: string;
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
 lastCompletedAction: { type: PowActionType; success: boolean; errorMessage?: string } | null;
  successOverlay: { type: PowActionType; success: boolean; errorMessage?: string } | null;
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

const RESULT_DISPLAY_DELAY_MS = 800;
const SUCCESS_SYNC_DELAY_MS = 500;
const NATIVE_CLEANUP_TIMEOUT_MS = 500;
const SUCCESS_OVERLAY_DURATION_MS = 2000;
const MAX_NETWORK_RETRIES = 3;
const NETWORK_RETRY_BACKOFF_MS = 2000;

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

const isNetworkError = (error: unknown): boolean =>
  (error as any)?.code === "ERR_NETWORK" ||
  (error as any)?.message === "Network Error";

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
      if (!isNetworkError(error)) throw error;
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES) {
        Sentry.addBreadcrumb({
          category: "pow",
          message: `Network error, waiting for connectivity (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})`,
          level: "warning",
        });
        await waitForConnectivity();
        await new Promise((r) => setTimeout(r, NETWORK_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }
  throw lastError;
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

    const state = get();
    const needsKick = !isProcessingLock && !state.currentAction;

    set({
      queue: [...state.queue, action as PowAction],
      totalCount: state.totalCount + 1,
      isProcessing: true,
    });

    if (needsKick) {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => get().processNext(), 16);
      });
    }
  },

  cancelAction: (actionId: string): boolean => {
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
        totalCount: Math.max(0, state.totalCount - 1),
        lastCompletedAction: null,
      });
      return true;
    }

    const idx = state.queue.findIndex((a) => a.id === actionId);
    if (idx !== -1) {
      const newQueue = [...state.queue];
      newQueue.splice(idx, 1);
      set({
        queue: newQueue,
        totalCount: Math.max(0, state.totalCount - 1),
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
    } catch (error) {
      currentCancelReject = null;

      const msg = String((error as Error)?.message || "");
      if (msg === "pow_cancelled" || isPowCancelled(error)) {
        wasCancelled = true;
      } else {
        const err = error instanceof Error ? error : new Error(String(error));
        const serverMsg = (error as any)?.response?.data?.error;
        const displayMsg = isNetworkError(error)
          ? "No internet connection"
          : serverMsg || err.message || "Something went wrong";
        if (!isNetworkError(error) && !isPowCancelled(error)) {
          Sentry.captureException(err, {
            tags: { action: "pow_action", pow_type: nextAction.type },
            extra: { actionId: nextAction.id, label: nextAction.label },
          });
        }
        nextAction.onRollback?.();
        nextAction.onError?.(err);

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
      }
    } finally {
      if (wasCancelled) {
        const nativeCleanup = executePromise
          ? executePromise.catch(() => {})
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
