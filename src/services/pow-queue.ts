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
import { InteractionManager } from "react-native";
import { cancelPow } from "@/src/wallet";

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
  | "report";

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
  lastCompletedAction: { type: PowActionType; success: boolean } | null;
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
    default:
      return "Done";
  }
};

let isProcessingLock = false;
let currentCancelReject: ((reason?: unknown) => void) | null = null;

export const usePowQueueStore = create<PowQueueStore>((set, get) => ({
  queue: [],
  currentAction: null,
  isProcessing: false,
  completedCount: 0,
  totalCount: 0,
  currentProgress: 0,
  lastError: null,
  lastCompletedAction: null,

  enqueue: <T>(action: PowAction<T>) => {
    action.onOptimisticUpdate?.();

    const state = get();
    const wasIdle =
      !state.isProcessing &&
      !state.currentAction &&
      state.queue.length === 0;

    set({
      queue: [...state.queue, action as PowAction],
      totalCount: state.totalCount + 1,
      isProcessing: true,
    });

    if (wasIdle) {
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
      lastCompletedAction: null,
    });

    let wasCancelled = false;
    let executePromise: Promise<unknown> | null = null;

    const cancelPromise = new Promise<never>((_, reject) => {
      currentCancelReject = reject;
    });
    cancelPromise.catch(() => {});

    try {
      executePromise = nextAction.execute();
      const result = await Promise.race([executePromise, cancelPromise]);

      currentCancelReject = null;
      nextAction.onSuccess?.(result);

      set((s) => ({
        completedCount: s.completedCount + 1,
        lastError: null,
        lastCompletedAction: { type: nextAction.type, success: true },
      }));

      await new Promise((resolve) =>
        setTimeout(resolve, SUCCESS_SYNC_DELAY_MS)
      );
    } catch (error) {
      currentCancelReject = null;

      const msg = String((error as Error)?.message || "");
      if (msg === "pow_cancelled") {
        wasCancelled = true;
      } else {
        const err = error instanceof Error ? error : new Error(String(error));
        nextAction.onRollback?.();
        nextAction.onError?.(err);

        set((s) => ({
          completedCount: s.completedCount + 1,
          lastError: err,
          lastCompletedAction: { type: nextAction.type, success: false },
        }));
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
          if (get().queue.length > 0) {
            get().processNext();
          }
        });
      } else {
        isProcessingLock = false;
        set({ currentAction: null, currentProgress: 0 });
        setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            get().processNext();
          });
        }, RESULT_DISPLAY_DELAY_MS);
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
    });
  },
}));

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
  };
};
