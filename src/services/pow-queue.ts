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
 */

import { create } from "zustand";

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
  /** Set when an action just completed - used by UI to show result */
  lastCompletedAction: { type: PowActionType; success: boolean } | null;
}

export interface PowQueueActions {
  enqueue: <T>(action: PowAction<T>) => void;
  processNext: () => Promise<void>;
  updateProgress: (progress: number) => void;
  clear: () => void;
  reset: () => void;
  /** Called by UI after showing result to continue processing */
  continueProcessing: () => void;
}

type PowQueueStore = PowQueueState & PowQueueActions;

/** Delay before processing next action (to show success/error state) */
const RESULT_DISPLAY_DELAY_MS = 1200;

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
    const state = get();

    action.onOptimisticUpdate?.();

    set({
      queue: [...state.queue, action as PowAction],
      totalCount: state.totalCount + 1,
    });

    if (!state.isProcessing) {
      get().processNext();
    }
  },

  processNext: async () => {
    const state = get();

    if (state.queue.length === 0) {
      // All done - but keep lastCompletedAction so UI can show final result
      set({
        isProcessing: false,
        currentAction: null,
        currentProgress: 0,
      });
      
      // Reset counts after a delay to let UI dismiss
      setTimeout(() => {
        const currentState = get();
        // Only reset if still not processing (no new items added)
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

    const [nextAction, ...remainingQueue] = state.queue;

    set({
      isProcessing: true,
      currentAction: nextAction,
      queue: remainingQueue,
      currentProgress: 0,
      lastCompletedAction: null,
    });

    let success = true;
    try {
      const result = await nextAction.execute();
      nextAction.onSuccess?.(result);

      set((s) => ({
        completedCount: s.completedCount + 1,
        lastError: null,
        lastCompletedAction: { type: nextAction.type, success: true },
      }));
    } catch (error) {
      success = false;
      const err = error instanceof Error ? error : new Error(String(error));
      nextAction.onRollback?.();
      nextAction.onError?.(err);

      set((s) => ({
        completedCount: s.completedCount + 1,
        lastError: err,
        lastCompletedAction: { type: nextAction.type, success: false },
      }));
    }

    // Clear current action to signal completion
    set({ currentAction: null, currentProgress: 0 });

    // Wait before processing next to allow UI to show result
    setTimeout(() => {
      get().processNext();
    }, RESULT_DISPLAY_DELAY_MS);
  },

  continueProcessing: () => {
    // Called by UI to manually continue (not used currently but available)
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
