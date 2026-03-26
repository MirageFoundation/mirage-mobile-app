import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { syncRootPostMetadataToFeedCaches } from "@/src/api/cache/posts-cache";
import { transformApiComments, transformApiPost, useComments } from "@/src/api/read";
import { getComments } from "@/src/api/read/endpoints/posts";
import { queryKeys } from "@/src/api/read/query-keys";
import type {
  CommentsResponse,
  PostWithChildren,
  PostsResponse,
} from "@/src/api/types";
import type { Comment, Post } from "@/src/components/molecules";
import { useAppState } from "@/src/hooks";
import type { User } from "@/src/stores";
import { useTimeTickStore } from "@/src/stores";
import { useHistoryStore } from "@/src/stores/history-store";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

type UsePostDetailSyncParams = {
  id?: string;
  currentUser: User | null;
  followedUsers: string[];
  localComments: Comment[];
  optimisticReplies: Record<string, Comment[]>;
  setLocalComments: Dispatch<SetStateAction<Comment[]>>;
  setOptimisticReplies: Dispatch<SetStateAction<Record<string, Comment[]>>>;
};

type UsePostDetailSyncReturn = {
  commentsData: CommentsResponse | undefined;
  isLoadingComments: boolean;
  isCommentsError: boolean;
  refetchComments: () => Promise<unknown>;
  isRefetchingComments: boolean;
  post: Post | null;
  comments: Comment[];
  rootPostData: PostWithChildren | undefined;
  rootCommentCount: number | undefined;
  screenActive: boolean;
  setScreenActive: Dispatch<SetStateAction<boolean>>;
  refetchCommentsRef: RefObject<((silent?: boolean) => void) | null>;
  isMountedRef: RefObject<boolean>;
};

export function usePostDetailSync({
  id,
  currentUser,
  followedUsers,
  localComments,
  optimisticReplies,
  setLocalComments,
  setOptimisticReplies,
}: UsePostDetailSyncParams): UsePostDetailSyncReturn {
  const queryClient = useQueryClient();
  const [screenActive, setScreenActive] = useState(true);
  const refetchCommentsRef = useRef<((silent?: boolean) => void) | null>(null);
  const lastCommentsFetchRef = useRef<number>(0);
  const isScreenFocusedRef = useRef(true);
  const isMountedRef = useRef(true);
  const hasInitialCommentsLoaded = useRef(false);
  const COMMENTS_DEBOUNCE_MS = 2000;

  const isFocused = useIsFocused();

  const {
    data: commentsData,
    isLoading: isLoadingComments,
    isError: isCommentsError,
    isFetching: isFetchingComments,
    refetch: refetchComments,
    isRefetching: isRefetchingComments,
  } = useComments(id, { enabled: isFocused });

  useAppState({
    onBackground: () => {
      setScreenActive(false);
    },
    onForeground: () => {
      setScreenActive(isScreenFocusedRef.current);
      refetchCommentsRef.current?.(true);
      useTimeTickStore.getState().bump();
    },
    staleThreshold: 0,
  });

  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      setScreenActive(true);
      useTimeTickStore.getState().bump();
      return () => {
        isScreenFocusedRef.current = false;
        setScreenActive(false);
      };
    }, []),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isFetchingComments) {
      lastCommentsFetchRef.current = Date.now();
    }
  }, [isFetchingComments]);

  useEffect(() => {
    refetchCommentsRef.current = async (silent?: boolean) => {
      if (!id) return;

      if (silent) {
        const now = Date.now();
        if (now - lastCommentsFetchRef.current < COMMENTS_DEBOUNCE_MS) return;
        lastCommentsFetchRef.current = now;
        const address = currentUser?.walletAddress ?? undefined;
        getComments({ post_id: id, address })
          .then((data) => {
            queryClient.setQueryData(queryKeys.comments(id, address), data);
          })
          .catch(() => {});
      } else {
        lastCommentsFetchRef.current = Date.now();
        await refetchComments();
      }
    };
  }, [COMMENTS_DEBOUNCE_MS, currentUser?.walletAddress, id, queryClient, refetchComments]);

  useFocusEffect(
    useCallback(() => {
      refetchCommentsRef.current?.(true);
    }, []),
  );

  useEffect(() => {
    if (!commentsData?.root) return;
    syncRootPostMetadataToFeedCaches(queryClient, commentsData.root);
  }, [commentsData?.root, queryClient]);

  const cachedFeedPost = useMemo(() => {
    if (!id) return null;

    const cachedQueries = queryClient.getQueriesData<InfiniteData<PostsResponse>>({
      queryKey: queryKeys.postsRoot(),
    });

    for (const [, queryData] of cachedQueries) {
      const matchedPost = queryData?.pages
        ?.flatMap((page) => page.posts)
        .find((candidate) => candidate.post_id === id);
      if (matchedPost) {
        return matchedPost;
      }
    }

    return null;
  }, [id, queryClient]);

  const resolvedRootPost = commentsData?.root ?? cachedFeedPost ?? undefined;

  const post = useMemo(() => {
    if (!resolvedRootPost) return null;
    return transformApiPost(resolvedRootPost, {
      followedUsers,
      currentUser: currentUser
        ? { id: currentUser.id, username: currentUser.username }
        : undefined,
    });
  }, [resolvedRootPost, followedUsers, currentUser]);

  useEffect(() => {
    if (post) {
      useHistoryStore.getState().addEntry(post);
    }
  }, [post]);

  const comments = useMemo(() => {
    if (!commentsData?.children) return [];
    return transformApiComments(commentsData.children);
  }, [commentsData]);

  useEffect(() => {
    if (!commentsData?.children) return;

    if (!hasInitialCommentsLoaded.current) {
      hasInitialCommentsLoaded.current = true;
      return;
    }

    const findMatchingServerComment = (
      optimisticComment: Comment,
      serverComments: Comment[],
    ): boolean => {
      for (const serverComment of serverComments) {
        if (
          serverComment.content === optimisticComment.content &&
          serverComment.author.id === optimisticComment.author.id
        ) {
          return true;
        }
        if (
          serverComment.replies &&
          serverComment.replies.length > 0 &&
          findMatchingServerComment(optimisticComment, serverComment.replies)
        ) {
          return true;
        }
      }
      return false;
    };

    setLocalComments((prev) => {
      const filtered = prev.filter(
        (comment) => !findMatchingServerComment(comment, comments),
      );
      return filtered.length === prev.length ? prev : filtered;
    });

    setOptimisticReplies((prev) => {
      const updated: Record<string, Comment[]> = {};
      let hasChanges = false;

      for (const [parentId, replies] of Object.entries(prev)) {
        const filtered = replies.filter(
          (comment) => !findMatchingServerComment(comment, comments),
        );
        if (filtered.length > 0) {
          updated[parentId] = filtered;
        }
        if (filtered.length !== replies.length) {
          hasChanges = true;
        }
      }

      return hasChanges ? updated : prev;
    });
  }, [comments, commentsData?.children, localComments, optimisticReplies, setLocalComments, setOptimisticReplies]);

  return {
    commentsData,
    isLoadingComments,
    isCommentsError,
    refetchComments,
    isRefetchingComments,
    post,
    comments,
    rootPostData: commentsData?.root ?? resolvedRootPost,
    rootCommentCount: commentsData?.root?.comments,
    screenActive,
    setScreenActive,
    refetchCommentsRef,
    isMountedRef,
  };
}
