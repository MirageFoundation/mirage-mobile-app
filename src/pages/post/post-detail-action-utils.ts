import type { Comment, Post } from "@/src/components/molecules";
import type { Post as ApiPost } from "@/src/api/types";

type CurrentUser = {
  id: string;
  username: string | null;
};

export function buildContentWithOptionalMedia(
  text: string,
  mediaUrl?: string | null,
): string {
  if (!mediaUrl) {
    return text;
  }

  return text.trim() ? `${mediaUrl}\n\n${text.trim()}` : mediaUrl;
}

export function createOptimisticComment(params: {
  optimisticCommentId: string;
  currentUser: CurrentUser;
  content: string;
  parentId: string | null;
}): Comment {
  const { optimisticCommentId, currentUser, content, parentId } = params;

  return {
    id: optimisticCommentId,
    author: {
      id: currentUser.id,
      username: currentUser.username ?? "you",
      avatarSeed: currentUser.username ?? currentUser.id,
    },
    content,
    likes: 1,
    dislikes: 0,
    hasLiked: true,
    hasDisliked: false,
    createdAt: new Date(),
    replyCount: 0,
    parentId,
  };
}

export function replaceOptimisticReplyId(params: {
  repliesByParent: Record<string, Comment[]>;
  replyTargetId: string;
  optimisticCommentId: string;
  confirmedCommentId: string;
}): Record<string, Comment[]> {
  const { repliesByParent, replyTargetId, optimisticCommentId, confirmedCommentId } = params;
  const existingReplies = repliesByParent[replyTargetId];
  if (!existingReplies) {
    return repliesByParent;
  }

  let hasChange = false;
  const nextReplies = existingReplies.map((comment) => {
    if (comment.id !== optimisticCommentId) return comment;
    hasChange = true;
    return {
      ...comment,
      id: confirmedCommentId,
    };
  });

  if (!hasChange) {
    return repliesByParent;
  }

  return {
    ...repliesByParent,
    [replyTargetId]: nextReplies,
  };
}

export function removeOptimisticReply(params: {
  repliesByParent: Record<string, Comment[]>;
  replyTargetId: string;
  optimisticCommentId: string;
}): Record<string, Comment[]> {
  const { repliesByParent, replyTargetId, optimisticCommentId } = params;
  const existingReplies = repliesByParent[replyTargetId];
  if (!existingReplies) {
    return repliesByParent;
  }

  const updated = { ...repliesByParent };
  updated[replyTargetId] = existingReplies.filter(
    (comment) => comment.id !== optimisticCommentId,
  );

  if (updated[replyTargetId].length === 0) {
    delete updated[replyTargetId];
  }

  return updated;
}

export function replaceLocalCommentId(
  comments: Comment[],
  optimisticCommentId: string,
  confirmedCommentId: string,
): Comment[] {
  return comments.map((comment) =>
    comment.id === optimisticCommentId
      ? { ...comment, id: confirmedCommentId }
      : comment,
  );
}

export function removeLocalComment(
  comments: Comment[],
  optimisticCommentId: string,
): Comment[] {
  return comments.filter((comment) => comment.id !== optimisticCommentId);
}

export function buildCommentEditParams(params: {
  postId: string;
  selectedComment: Comment;
  displayPost: Post | null;
}): Record<string, string> {
  const { postId, selectedComment, displayPost } = params;
  const commentCreatedAt =
    selectedComment.createdAt instanceof Date
      ? Math.floor(selectedComment.createdAt.getTime() / 1000)
      : Math.floor(
          Number(selectedComment.createdAt) /
            (Number(selectedComment.createdAt) > 1e12 ? 1000 : 1),
        );

  const routeParams: Record<string, string> = {
    postId,
    postTitle: displayPost?.title ?? "",
    postAuthorUsername: displayPost?.author.username ?? "",
    editCommentId: selectedComment.id,
    editParentId: selectedComment.parentId ?? postId,
    editContent: selectedComment.content,
    editCreatedAt: String(commentCreatedAt),
    editSource: "post",
  };

  if (displayPost?.media?.[0]?.uri) {
    routeParams.postThumbnail = displayPost.media[0].uri;
  }

  return routeParams;
}

export function buildPostEditParams(
  displayPost: Post,
  postData?: ApiPost,
): Record<string, string> {
  const createdAtSeconds =
    postData?.timestamp ??
    (displayPost.createdAt instanceof Date
      ? Math.floor(displayPost.createdAt.getTime() / 1000)
      : Math.floor(
          Number(displayPost.createdAt) /
            (Number(displayPost.createdAt) > 1e12 ? 1000 : 1),
        ));

  const routeParams: Record<string, string> = {
    editPostId: displayPost.id,
    editTopic: displayPost.topic ?? "general",
    editTitle: displayPost.title,
    editBody: displayPost.body ?? postData?.content ?? "",
    editTag: postData?.tag ?? "",
    editCreatedAt: String(createdAtSeconds),
  };

  if (postData?.media && postData.media.length > 0) {
    routeParams.editMedia = JSON.stringify(postData.media);
  } else if (displayPost.media && displayPost.media.length > 0) {
    routeParams.editMedia = JSON.stringify(displayPost.media.map((media) => media.uri));
  }

  return routeParams;
}

export function buildAnnotateParams(
  displayPost: Post,
  postData?: ApiPost,
): Record<string, string> {
  const routeParams: Record<string, string> = {
    postId: displayPost.id,
    postTitle: displayPost.title,
    postTopic: displayPost.topic ?? "",
    postContent: displayPost.body ?? postData?.content ?? "",
    postTag: postData?.tag ?? "",
    postLikes: String(displayPost.likes ?? 0),
    postComments: String(displayPost.comments ?? 0),
  };

  if (displayPost.media?.[0]?.uri) {
    routeParams.postThumbnail = displayPost.media[0].uri;
  }

  return routeParams;
}
