type QueueActionIdentity = { id: string };

export type QueuedActionIds = Record<string, true>;

export function buildQueuedActionIds(
  queue: readonly QueueActionIdentity[],
): QueuedActionIds {
  const actionIds: QueuedActionIds = {};
  for (const action of queue) {
    actionIds[action.id] = true;
  }
  return actionIds;
}

export const selectIsActionQueued = (
  queuedActionIds: QueuedActionIds,
  actionId: string | undefined,
): boolean => !!actionId && queuedActionIds[actionId] === true;
