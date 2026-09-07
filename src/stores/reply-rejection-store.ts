import { create } from "zustand";
import { isLegacyThreadReadOnlyError, LegacyThreadReadOnlyError } from "@/src/domain/subscriptions/errors";

const rejectionKey = (server: string, parentId: string) =>
  JSON.stringify([server, parentId.toLowerCase()]);

type ReplyRejectionState = {
  rejected: Readonly<Record<string, true>>;
  recordRejection: (server: string, parentId: string, error: unknown) => void;
};

// Session-only evidence, independent of optimistic comment snapshots and lenses.
export const useReplyRejectionStore = create<ReplyRejectionState>((set) => ({
  rejected: {},
  recordRejection: (server, parentId, error) => {
    if (!isLegacyThreadReadOnlyError(error)) return;
    set((state) => ({
      rejected: { ...state.rejected, [rejectionKey(server, parentId)]: true },
    }));
  },
}));

export function isReplyRejected(
  state: Pick<ReplyRejectionState, "rejected">,
  server: string,
  parentId: string,
): boolean {
  return state.rejected[rejectionKey(server, parentId)] === true;
}

export function assertReplyNotRejected(server: string, parentId: string): void {
  if (isReplyRejected(useReplyRejectionStore.getState(), server, parentId)) {
    throw new LegacyThreadReadOnlyError();
  }
}
