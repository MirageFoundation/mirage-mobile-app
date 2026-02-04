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
import { InteractionManager } from "react-native";

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
const RESULT_DISPLAY_DELAY_MS = 800;

/** Additional delay after successful action to let backend sync */
const SUCCESS_SYNC_DELAY_MS = 500;
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

// Flag to prevent concurrent processNext calls
let isProcessingLock = false;

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
    // Call optimistic update immediately
    action.onOptimisticUpdate?.();

    const state = get();
    const wasIdle = !state.isProcessing && !state.currentAction && state.queue.length === 0;

    set({
      queue: [...state.queue, action as PowAction],
      totalCount: state.totalCount + 1,
      isProcessing: true,
    });

    // Only start processing if we were idle
    if (wasIdle) {
      // Use InteractionManager to defer processing until after UI updates complete
      // This prevents blocking touch handlers and animations
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => get().processNext(), 16); // One frame delay
      });
    }
  },

  processNext: async () => {
    // Prevent concurrent execution
    if (isProcessingLock) {
      return;
    }

    const state = get();

    // Guard: already processing an action
    if (state.currentAction) {
      return;
    }

    // Guard: nothing in queue
    if (state.queue.length === 0) {
      set({
        isProcessing: false,
        currentAction: null,
        currentProgress: 0,
      });
      
      // Reset counts after delay
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

    // Lock processing
    isProcessingLock = true;

    // Get the next action from queue
    const [nextAction, ...remainingQueue] = state.queue;

    set({
      currentAction: nextAction,
      queue: remainingQueue,
      currentProgress: 0,
      lastCompletedAction: null,
    });

   try {
     const result = await nextAction.execute();
     nextAction.onSuccess?.(result);

     set((s) => ({
       completedCount: s.completedCount + 1,
       lastError: null,
       lastCompletedAction: { type: nextAction.type, success: true },
     }));

     // Additional delay after success to let backend sync block hash
     await new Promise((resolve) => setTimeout(resolve, SUCCESS_SYNC_DELAY_MS));
   } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      nextAction.onRollback?.();
      nextAction.onError?.(err);

      set((s) => ({
        completedCount: s.completedCount + 1,
        lastError: err,
        lastCompletedAction: { type: nextAction.type, success: false },
      }));
    } finally {
      // Clear current action
      set({ currentAction: null, currentProgress: 0 });
      
      // Unlock processing
      isProcessingLock = false;

      // Schedule next action after delay (to show result)
      // Use InteractionManager to not block UI during the delay
      setTimeout(() => {
        InteractionManager.runAfterInteractions(() => {
          get().processNext();
        });
      }, RESULT_DISPLAY_DELAY_MS);
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
