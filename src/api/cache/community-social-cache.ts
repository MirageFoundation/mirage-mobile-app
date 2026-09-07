import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";

function invalidateFamilies(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
): Promise<void[]> {
  return Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

export function invalidateAfterCommunityJoinOrLeave(
  queryClient: QueryClient,
  input: { address?: string | null; community: string },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.communitiesRoot(),
    queryKeys.communityDetailRoot(input.community),
    queryKeys.postsRoot(),
    queryKeys.searchRoot(),
    queryKeys.inboxRoot(),
  ];
  if (input.address) {
    keys.push(
      queryKeys.profile(input.address),
      queryKeys.userFollowed(input.address),
    );
  }
  return invalidateFamilies(queryClient, keys);
}

export function invalidateAfterCommunityPreference(
  queryClient: QueryClient,
  input: { community: string },
): Promise<void[]> {
  return invalidateFamilies(queryClient, [
    queryKeys.communityDetailRoot(input.community),
    queryKeys.postsRoot(),
    queryKeys.searchRoot(),
    queryKeys.inboxRoot(),
  ]);
}

export function invalidateAfterCommunityBlockChange(
  queryClient: QueryClient,
  input: { address?: string | null; community: string },
): Promise<void[]> {
  const keys: (readonly unknown[])[] = [
    queryKeys.communityDetailRoot(input.community),
    queryKeys.communitiesRoot(),
    queryKeys.postsRoot(),
    queryKeys.commentsRoot(),
    queryKeys.userPostsRoot(),
    queryKeys.searchRoot(),
    queryKeys.inboxRoot(),
  ];
  if (input.address) {
    keys.push(
      queryKeys.userBlocked(input.address),
      queryKeys.profile(input.address),
    );
  }
  return invalidateFamilies(queryClient, keys);
}
