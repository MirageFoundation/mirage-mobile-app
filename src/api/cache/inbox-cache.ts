import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import type {
  CommentsResponse,
  InboxReply,
  PostWithChildren,
} from "@/src/api/types";

function buildInboxCommentPost(reply: InboxReply): PostWithChildren {
  return {
    post_id: reply.reply_id,
    user_id: reply.reply_owner,
    username: reply.reply_username || reply.reply_owner,
    author_level: reply.reply_author_level,
    timestamp: reply.reply_timestamp,
    topic: "",
    root_topic: "",
    root_post_id: reply.root_post_id,
    title: "",
    content: reply.reply_content,
    tag: "",
    edited_at: 0,
    thumbnail: "",
    points: 0,
    comments: 0,
    user_vote: 0,
    user_weight: 0,
    children: [],
  };
}

export function seedFocusedCommentFromInbox(
  queryClient: QueryClient,
  reply: InboxReply,
  address?: string,
): void {
  const comment = buildInboxCommentPost(reply);

  // Preserve any existing focused-comment cache children. The inbox payload
  // has no children info, so unconditionally writing `children: []` would
  // briefly wipe out a richer tree that was already fetched (e.g. on a second
  // open of the same reply), producing a transient empty focused thread.
  const existingFocused = queryClient.getQueryData<CommentsResponse>(
    queryKeys.comments(reply.reply_id, address),
  );

  // Deliberately seeded WITHOUT `ancestors`. The inbox payload knows the parent
  // and the root post id but not the root post itself, so it cannot construct a
  // truthful chain. Omitting the key marks this entry unresolved
  // (`readThreadAncestors` → `resolved: false`), which paints the focused
  // comment immediately without letting the UI mistake it for a root post. The
  // real chain arrives with the single `get_comments` fetch this triggers.
  const focusedCommentData: CommentsResponse = {
    root: comment,
    children: existingFocused?.children ?? [],
    ...(existingFocused?.ancestors ? { ancestors: existingFocused.ancestors } : {}),
  };

  queryClient.setQueryData(
    queryKeys.comments(reply.reply_id, address),
    focusedCommentData,
  );

  // Mark the seeded entry stale WITHOUT triggering a refetch here. The
  // post-detail screen mounts an observer for this exact key immediately after
  // navigation, and stale + mount already causes exactly one fetch — which now
  // returns the entire thread.
  void queryClient.invalidateQueries({
    queryKey: queryKeys.comments(reply.reply_id, address),
    refetchType: "none",
  });
}
