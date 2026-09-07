export type ThreadReplyReason = "can_reply" | "legacy_rejection" | "served_lock";

export type ThreadReplyPolicy = {
  canReply: boolean;
  reason: ThreadReplyReason;
  notice: string | null;
};

export const SERVED_LOCK_NOTICE = "This thread is locked in this view.";
export const LEGACY_THREAD_NOTICE = "This older thread is read-only.";

export type ThreadReplyRoot = {
  protocol_version?: number | null;
  thread_locked?: boolean | null;
} | null | undefined;

// Read protocol versions do not establish the immediate parent's chain metadata.
export function getThreadReplyPolicy(
  root: ThreadReplyRoot,
  parentRejected = false,
): ThreadReplyPolicy {
  if (parentRejected) {
    return {
      canReply: false,
      reason: "legacy_rejection",
      notice: LEGACY_THREAD_NOTICE,
    };
  }
  if (root?.thread_locked === true) {
    return {
      canReply: false,
      reason: "served_lock",
      notice: SERVED_LOCK_NOTICE,
    };
  }
  return {
    canReply: true,
    reason: "can_reply",
    notice: null,
  };
}

export function threadReplyNotice(root: ThreadReplyRoot): string | null {
  return getThreadReplyPolicy(root).notice;
}
