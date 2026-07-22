import type { PowAction, PowQueueState } from "./pow-queue";

type ToastAction = Pick<PowAction, "id" | "type" | "label">;
type ToastResult = PowQueueState["lastCompletedAction"];

export interface PowQueueToastPresentation {
  currentAction: ToastAction | null;
  preparingAction: ToastAction | null;
  nextAction: ToastAction | null;
  hasVisibleWork: boolean;
  completedCount: number;
  totalCount: number;
  lastCompletedAction: ToastResult;
  successOverlay: PowQueueState["successOverlay"];
}

type PowQueueToastState = Pick<
  PowQueueState,
  | "queue"
  | "currentAction"
  | "preparingAction"
  | "completedCount"
  | "totalCount"
  | "lastCompletedAction"
  | "successOverlay"
>;

const toVisibleAction = (action: PowAction | null): ToastAction | null =>
  action && action.showProgress !== false
    ? { id: action.id, type: action.type, label: action.label }
    : null;

const areActionsEqual = (left: ToastAction | null, right: ToastAction | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.id === right.id &&
    left.type === right.type &&
    left.label === right.label);

const areResultsEqual = (left: ToastResult, right: ToastResult) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.type === right.type &&
    left.success === right.success &&
    left.errorMessage === right.errorMessage &&
    left.skippedPoW === right.skippedPoW);

const arePresentationsEqual = (
  left: PowQueueToastPresentation,
  right: PowQueueToastPresentation,
) =>
  areActionsEqual(left.currentAction, right.currentAction) &&
  areActionsEqual(left.preparingAction, right.preparingAction) &&
  areActionsEqual(left.nextAction, right.nextAction) &&
  left.hasVisibleWork === right.hasVisibleWork &&
  left.completedCount === right.completedCount &&
  left.totalCount === right.totalCount &&
  areResultsEqual(left.lastCompletedAction, right.lastCompletedAction) &&
  areResultsEqual(left.successOverlay, right.successOverlay);

export const createPowQueueToastPresentationSelector = () => {
  let previous: PowQueueToastPresentation | undefined;

  return (state: PowQueueToastState): PowQueueToastPresentation => {
    const currentAction = toVisibleAction(state.currentAction);
    const preparingAction = toVisibleAction(state.preparingAction);
    const queuedAction = state.queue.find(
      (action) => action.showProgress !== false,
    );
    const next: PowQueueToastPresentation = {
      currentAction,
      preparingAction,
      nextAction: queuedAction ? toVisibleAction(queuedAction) : null,
      hasVisibleWork:
        currentAction !== null ||
        preparingAction !== null ||
        queuedAction !== undefined,
      completedCount: state.completedCount,
      totalCount: state.totalCount,
      lastCompletedAction: state.lastCompletedAction,
      successOverlay: state.successOverlay,
    };

    if (previous && arePresentationsEqual(previous, next)) {
      return previous;
    }

    previous = next;
    return next;
  };
};
