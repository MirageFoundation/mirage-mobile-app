import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { transformApiPosts, useInfinitePosts } from "@/src/api";
import { mergePendingPostWithCachedPost } from "@/src/api/cache/transient-post-success";
import type { Post } from "@/src/components/molecules";
import { usePostDataRefresher } from "@/src/hooks/use-post-data-refresher";
import {
  useAuthStore,
  useContentModerationStore,
  usePreferencesStore,
} from "@/src/stores";
import { usePendingPostsStore } from "@/src/stores/pending-posts-store";
import { usePostEditStore } from "@/src/stores/post-edit-store";
import {
  INITIAL_PAGE_SIZE,
  NEXT_PAGE_SIZE,
} from "./home-tabbed-feed-state";

type UseHomeTabbedFeedPostsOptions = {
  baseFeed: "home" | "following";
  allowedTags: string | null;
  latestTabActivated: boolean;
  showBars: () => void;
};

export function useHomeTabbedFeedPosts({
  baseFeed,
  allowedTags,
  latestTabActivated,
  showBars,
}: UseHomeTabbedFeedPostsOptions) {
  const currentUser = useAuthStore((state) => state.user);
  const hiddenPostIds = useContentModerationStore((state) => state.hiddenPostIds);
  const blockedUserIds = useContentModerationStore((state) => state.blockedUserIds);
  const blockedTopicNames = useContentModerationStore((state) => state.blockedTopicNames);
  const hideDownvotedPosts = usePreferencesStore((state) => state.hideDownvotedPosts);
  const pendingApiPosts = usePendingPostsStore((state) => state.posts);
  const postEditOverrides = usePostEditStore((state) => state.overrides);
  const transformedPageCacheRef = useRef(new WeakMap<object, Post[]>());
  const reportedSuccessReconciliationsRef = useRef(new Set<string>());

  const magicQuery = useInfinitePosts(
    {
      limit: INITIAL_PAGE_SIZE,
      feed: baseFeed,
      by: "magic",
      allowed_tags: allowedTags || undefined,
    },
    { pageLimit: NEXT_PAGE_SIZE },
  );
  const latestQuery = useInfinitePosts(
    {
      limit: INITIAL_PAGE_SIZE,
      feed: baseFeed,
      by: "newest",
      allowed_tags: allowedTags || undefined,
    },
    { enabled: latestTabActivated, pageLimit: NEXT_PAGE_SIZE },
  );

  useEffect(() => {
    if (pendingApiPosts.some((post) => post.optimistic_status === "success")) {
      showBars();
    }
  }, [pendingApiPosts, showBars]);

  const feedRefreshParamsList = useMemo(
    () => [
      {
        feed: baseFeed,
        by: "magic" as const,
        allowed_tags: allowedTags || undefined,
        limit: INITIAL_PAGE_SIZE,
        address: currentUser?.walletAddress,
      },
      ...(latestTabActivated
        ? [{
            feed: baseFeed,
            by: "newest" as const,
            allowed_tags: allowedTags || undefined,
            limit: INITIAL_PAGE_SIZE,
            address: currentUser?.walletAddress,
          }]
        : []),
    ],
    [allowedTags, baseFeed, currentUser?.walletAddress, latestTabActivated],
  );
  const visibleTrackerKeys = useMemo(
    () => [`${baseFeed}:magic`, `${baseFeed}:latest`],
    [baseFeed],
  );
  const clearTransformedPageCache = useCallback(() => {
    transformedPageCacheRef.current = new WeakMap();
  }, []);

  usePostDataRefresher({
    feedParamsList: feedRefreshParamsList,
    onRefreshComplete: clearTransformedPageCache,
    visibleTrackerKeys,
  });

  const applyPostEditOverrides = useCallback(
    (posts: any[]) => {
      if (Object.keys(postEditOverrides).length === 0) return posts;
      return posts.map((post: any) => {
        const override = postEditOverrides[post.post_id];
        if (!override) return post;
        return {
          ...post,
          title: override.title,
          content: override.content,
          topic: override.topic ?? post.topic,
          media: override.media ?? post.media,
        };
      });
    },
    [postEditOverrides],
  );

  useEffect(() => {
    clearTransformedPageCache();
  }, [
    applyPostEditOverrides,
    blockedTopicNames,
    blockedUserIds,
    clearTransformedPageCache,
    currentUser?.id,
    currentUser?.username,
    hiddenPostIds,
    hideDownvotedPosts,
    pendingApiPosts,
  ]);

  const transformPosts = useCallback(
    (data: { pages?: { posts: any[] }[] } | undefined) => {
      const uniquePostIds = new Set<string>();
      const uniqueOptimisticActionIds = new Set<string>();
      const transformedPosts: Post[] = [];
      const pages = Array.isArray(data?.pages)
        ? data.pages.filter(
            (page): page is { posts: any[] } =>
              !!page && Array.isArray(page.posts),
          )
        : [];
      const isRenderableApiPost = (post: any) =>
        !!post &&
        typeof post === "object" &&
        typeof post.post_id === "string" &&
        typeof post.user_id === "string" &&
        (post.media === undefined ||
          (Array.isArray(post.media) &&
            post.media.every((uri: unknown) => typeof uri === "string")));
      const cachedPostsById = new Map(
        pages
          .flatMap((page) => page.posts.filter(isRenderableApiPost))
          .map((post) => [post.post_id, post]),
      );
      const reconciledPendingApiPosts = pendingApiPosts.map((pendingPost) => {
        const reconciledPost = mergePendingPostWithCachedPost(
          pendingPost,
          cachedPostsById.get(pendingPost.post_id),
        );
        if (
          reconciledPost !== pendingPost &&
          !reportedSuccessReconciliationsRef.current.has(pendingPost.post_id)
        ) {
          reportedSuccessReconciliationsRef.current.add(pendingPost.post_id);
          Sentry.addBreadcrumb({
            category: "create-post",
            message: "Transient success reconciled onto pending video",
            level: "info",
            data: { postId: pendingPost.post_id, feed: baseFeed },
          });
        }
        return reconciledPost;
      });
      const currentUserIdentity = currentUser?.id
        ? { id: currentUser.id, username: currentUser.username ?? null }
        : undefined;
      const filterModeratedPosts = (posts: Post[]) =>
        posts.filter(
          (post) =>
            !hiddenPostIds.has(post.id) &&
            !blockedUserIds.has(post.author.id) &&
            !(post.topic && blockedTopicNames.has(post.topic.toLowerCase())),
        );
      const pendingPosts = filterModeratedPosts(
        transformApiPosts(reconciledPendingApiPosts, {
          currentUser: currentUserIdentity,
        }),
      );

      for (const post of pendingPosts) {
        if (uniquePostIds.has(post.id)) continue;
        uniquePostIds.add(post.id);
        if (post.optimisticActionId) {
          uniqueOptimisticActionIds.add(post.optimisticActionId);
        }
        transformedPosts.push(post);
      }

      for (const page of pages) {
        let cachedPagePosts = transformedPageCacheRef.current.get(page);
        if (!cachedPagePosts) {
          const renderablePosts = page.posts.filter(isRenderableApiPost);
          const pagePosts = hideDownvotedPosts
            ? renderablePosts.filter((post) => post.user_vote !== -1)
            : renderablePosts;
          cachedPagePosts = filterModeratedPosts(
            transformApiPosts(applyPostEditOverrides(pagePosts), {
              currentUser: currentUserIdentity,
            }),
          );
          transformedPageCacheRef.current.set(page, cachedPagePosts);
        }

        for (const post of cachedPagePosts) {
          if (uniquePostIds.has(post.id)) continue;
          if (
            post.optimisticActionId &&
            uniqueOptimisticActionIds.has(post.optimisticActionId)
          ) continue;
          uniquePostIds.add(post.id);
          if (post.optimisticActionId) {
            uniqueOptimisticActionIds.add(post.optimisticActionId);
          }
          transformedPosts.push(post);
        }
      }
      return transformedPosts;
    },
    [
      applyPostEditOverrides,
      baseFeed,
      blockedTopicNames,
      blockedUserIds,
      currentUser?.id,
      currentUser?.username,
      hiddenPostIds,
      hideDownvotedPosts,
      pendingApiPosts,
    ],
  );

  const magicPosts = useMemo(
    () => transformPosts(magicQuery.data),
    [magicQuery.data, transformPosts],
  );
  const latestPosts = useMemo(
    () => transformPosts(latestQuery.data),
    [latestQuery.data, transformPosts],
  );

  return {
    clearTransformedPageCache,
    currentUser,
    latestPosts,
    latestQuery,
    magicPosts,
    magicQuery,
  };
}
