import { useEffect, useMemo } from "react";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { transformApiPost } from "@/src/api/read";
import type { CommentsResponse, PostsResponse, Post as ApiPost } from "@/src/api/types";
import { queryKeys } from "@/src/api/read/query-keys";
import type { Post } from "@/src/components/molecules";
import { useHistoryStore } from "@/src/stores/history-store";

type CurrentUser = {
  id: string;
  username: string | null;
  walletAddress?: string | null;
} | null | undefined;

type UsePostDetailResolvedPostParams = {
  actualRootPost?: ApiPost | null;
  actualRootPostId?: string | null;
  commentsData?: CommentsResponse;
  currentUser: CurrentUser;
  followedUsers: string[];
  id?: string;
  isViewingComment: boolean;
  queryClient: QueryClient;
};

const METADATA_KEYS: (keyof ApiPost)[] = [
  "points",
  "comments",
  "user_vote",
  "user_weight",
  "edited_at",
  "awards",
];

export function usePostDetailResolvedPost({
  actualRootPost,
  actualRootPostId,
  commentsData,
  currentUser,
  followedUsers,
  id,
  isViewingComment,
  queryClient,
}: UsePostDetailResolvedPostParams): {
  post: Post | null;
  resolvedRootPost: ApiPost | null | undefined;
} {
  useEffect(() => {
    const root = commentsData?.root;
    if (!root) return;

    queryClient.setQueriesData<InfiniteData<PostsResponse>>(
      { queryKey: queryKeys.postsRoot() },
      (old) => {
        if (!old?.pages) return old;

        let anyChanged = false;
        const newPages = old.pages.map((page) => {
          const index = page.posts.findIndex((candidate) => candidate.post_id === root.post_id);
          if (index === -1) return page;

          const existing = page.posts[index];
          const changed = METADATA_KEYS.some((key) => existing[key] !== root[key]);
          if (!changed) return page;

          anyChanged = true;
          const updated = { ...existing };
          for (const key of METADATA_KEYS) {
            (updated as any)[key] = root[key];
          }
          const newPosts = [...page.posts];
          newPosts[index] = updated;
          return { ...page, posts: newPosts };
        });

        if (!anyChanged) return old;
        return { ...old, pages: newPages };
      },
    );
  }, [commentsData?.root, queryClient]);

  const cachedFeedPost = useMemo(() => {
    if (!id) return null;
    const targetId = actualRootPostId ?? id;

    const cachedQueries = queryClient.getQueriesData<InfiniteData<PostsResponse>>({
      queryKey: queryKeys.postsRoot(),
    });

    for (const [, queryData] of cachedQueries) {
      const matchedPost = queryData?.pages
        ?.flatMap((page) => page.posts)
        .find((candidate) => candidate.post_id === targetId);
      if (matchedPost) return matchedPost;
    }

    return null;
  }, [actualRootPostId, id, queryClient]);

  const cachedRootPostFromComments = useMemo(() => {
    if (!actualRootPostId) return null;
    const address = currentUser?.walletAddress ?? undefined;
    const cachedComments = queryClient.getQueryData<CommentsResponse>(
      queryKeys.comments(actualRootPostId, address),
    );
    return cachedComments?.root ?? null;
  }, [actualRootPostId, currentUser?.walletAddress, queryClient]);

  const resolvedRootPost = isViewingComment
    ? actualRootPost ?? cachedRootPostFromComments ?? cachedFeedPost ?? commentsData?.root
    : commentsData?.root ?? cachedFeedPost;

  const post = useMemo(() => {
    if (!resolvedRootPost) return null;
    return transformApiPost(resolvedRootPost, {
      followedUsers,
      currentUser: currentUser
        ? { id: currentUser.id, username: currentUser.username }
        : undefined,
    });
  }, [currentUser, followedUsers, resolvedRootPost]);

  useEffect(() => {
    if (post) {
      useHistoryStore.getState().addEntry(post);
    }
  }, [post]);

  return { post, resolvedRootPost };
}
