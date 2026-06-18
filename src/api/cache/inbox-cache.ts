import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import type {
  CommentContextResponse,
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

function buildInboxParentPost(reply: InboxReply): PostWithChildren | null {
  if (!reply.parent_id || !reply.parent_content) return null;

  return {
    post_id: reply.parent_id,
    user_id: reply.parent_owner,
    username: reply.parent_owner,
    timestamp: reply.reply_timestamp,
    topic: "",
    root_topic: "",
    root_post_id: reply.root_post_id,
    title: "",
    content: reply.parent_content,
    tag: "",
    edited_at: 0,
    thumbnail: "",
    points: 0,
    comments: 1,
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
  const parent = buildInboxParentPost(reply);

  // Preserve any existing focused-comment cache children. The inbox payload
  // has no children info, so unconditionally writing `children: []` would
  // briefly wipe out a richer tree that was already fetched (e.g. on a second
  // open of the same reply), producing a transient empty focused thread.
  const existingFocused = queryClient.getQueryData<CommentsResponse>(
    queryKeys.comments(reply.reply_id, address),
  );
  const focusedCommentData: CommentsResponse = {
    root: comment,
    children: existingFocused?.children ?? [],
  };

  queryClient.setQueryData(
    queryKeys.comments(reply.reply_id, address),
    focusedCommentData,
  );
  queryClient.setQueryData(queryKeys.rootPostId(reply.reply_id), {
    root_post_id: reply.root_post_id,
  });

  if (parent) {
    // Only seed the parent context when we don't already have a richer one
    // cached. Avoids replacing a multi-ancestor context with a single-parent
    // snapshot on repeat opens.
    const existingContext = queryClient.getQueryData<CommentContextResponse>(
      queryKeys.commentContext(reply.reply_id, 5),
    );
    if (!existingContext || (existingContext.context?.length ?? 0) === 0) {
      queryClient.setQueryData(queryKeys.commentContext(reply.reply_id, 5), {
        comment_id: reply.reply_id,
        context: [parent],
      });
    }
  }

  void queryClient.invalidateQueries({
    queryKey: queryKeys.comments(reply.reply_id, address),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.commentContext(reply.reply_id, 5),
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.comments(reply.root_post_id, address),
  });
}
