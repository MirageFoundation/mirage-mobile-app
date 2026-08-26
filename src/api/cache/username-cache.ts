import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";

type CachePost = {
  user_id?: string;
  username?: string;
  children?: CachePost[];
  [key: string]: unknown;
};

function updatePostAuthorUsername(post: CachePost, walletAddress: string, username: string): CachePost {
  const updatedPost =
    post.user_id === walletAddress ? { ...post, username } : post;

  if (Array.isArray(updatedPost.children)) {
    return {
      ...updatedPost,
      children: updatedPost.children.map((child) =>
        updatePostAuthorUsername(child, walletAddress, username),
      ),
    };
  }

  return updatedPost;
}

function updateCachedPostData(data: unknown, walletAddress: string, username: string): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;

  if (Array.isArray(record.pages)) {
    return {
      ...record,
      pages: record.pages.map((page) => {
        if (!page || typeof page !== "object") return page;
        const pageRecord = page as Record<string, unknown>;
        return Array.isArray(pageRecord.posts)
          ? {
              ...pageRecord,
              posts: pageRecord.posts.map((post) =>
                updatePostAuthorUsername(post as CachePost, walletAddress, username),
              ),
            }
          : page;
      }),
    };
  }

  if (Array.isArray(record.posts)) {
    return {
      ...record,
      posts: record.posts.map((post) =>
        updatePostAuthorUsername(post as CachePost, walletAddress, username),
      ),
    };
  }

  if (record.root || Array.isArray(record.children)) {
    return {
      ...record,
      root: record.root
        ? updatePostAuthorUsername(record.root as CachePost, walletAddress, username)
        : record.root,
      children: Array.isArray(record.children)
        ? record.children.map((post) =>
            updatePostAuthorUsername(post as CachePost, walletAddress, username),
          )
        : record.children,
    };
  }

  if (Array.isArray(record.context)) {
    return {
      ...record,
      context: record.context.map((post) =>
        updatePostAuthorUsername(post as CachePost, walletAddress, username),
      ),
    };
  }

  return data;
}

function updateMatchingQueries(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (old: unknown) => unknown,
): void {
  queryClient.getQueriesData({ queryKey }).forEach(([key]) => {
    queryClient.setQueryData(key, updater);
  });
}

export function updateUsernameAcrossCaches(
  queryClient: QueryClient,
  walletAddress: string,
  username: string,
): void {
  queryClient.setQueryData(
    queryKeys.userStatus(walletAddress),
    (old: unknown) => (old && typeof old === "object" ? { ...old, username } : old),
  );
  queryClient.setQueryData(
    queryKeys.profile(walletAddress),
    (old: unknown) => (old && typeof old === "object" ? { ...old, username } : old),
  );
  queryClient.setQueryData(queryKeys.usernameFromAddress(walletAddress), username);

  const updateContent = (old: unknown) => updateCachedPostData(old, walletAddress, username);
  updateMatchingQueries(queryClient, queryKeys.postsRoot(), updateContent);
  updateMatchingQueries(queryClient, queryKeys.userPostsRoot(), updateContent);
  updateMatchingQueries(queryClient, queryKeys.commentsRoot(), updateContent);
  updateMatchingQueries(queryClient, queryKeys.batchUsernamesRoot(), (old) => {
    if (!old || typeof old !== "object") return old;
    return { ...(old as Record<string, unknown>), [walletAddress.toLowerCase()]: username };
  });
}

export function cancelUsernameRelatedQueries(
  queryClient: QueryClient,
  walletAddress: string,
): Promise<void[]> {
  return Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.userStatus(walletAddress) }),
    queryClient.cancelQueries({ queryKey: queryKeys.profile(walletAddress) }),
    queryClient.cancelQueries({ queryKey: queryKeys.postsRoot() }),
    queryClient.cancelQueries({ queryKey: queryKeys.userPostsRoot() }),
    queryClient.cancelQueries({ queryKey: queryKeys.commentsRoot() }),
  ]);
}

export function invalidateUsernameRelatedQueries(
  queryClient: QueryClient,
  walletAddress: string,
): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.userStatus(walletAddress) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile(walletAddress) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.usernameFromAddress(walletAddress) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.batchUsernamesRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.userPostsRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.commentsRoot() }),
  ]);
}
