import type { InboxReply } from "@/src/api/types";

type InboxPage = {
  replies?: readonly (InboxReply | null | undefined)[];
} | null | undefined;

export function flattenInboxReplies(pages?: readonly InboxPage[]): InboxReply[] {
  const replies: InboxReply[] = [];
  const seenReplyIds = new Set<string>();

  for (const page of pages ?? []) {
    for (const reply of page?.replies ?? []) {
      if (!reply?.reply_id || seenReplyIds.has(reply.reply_id)) continue;
      seenReplyIds.add(reply.reply_id);
      replies.push(reply);
    }
  }

  return replies;
}

export function prependInboxPreview(
  replies: readonly InboxReply[],
  previewReply: InboxReply | null,
): readonly InboxReply[] {
  if (!previewReply || replies.some((reply) => reply.reply_id === previewReply.reply_id)) {
    return replies;
  }

  return [previewReply, ...replies];
}

export function isInboxReplyUnread(
  reply: InboxReply,
  highlightBaselineAt: number,
  readReplyIds: ReadonlySet<string>,
): boolean {
  return reply.reply_timestamp > highlightBaselineAt && !readReplyIds.has(reply.reply_id);
}
