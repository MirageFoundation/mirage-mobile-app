// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../src/api/read/query-keys";
import {
  invalidateAfterCommunityBlockChange,
  invalidateAfterCommunityJoinOrLeave,
  invalidateAfterCommunityPreference,
} from "../src/api/cache/community-social-cache";

const VIEWER = "mirage1viewer";
const OTHER = "mirage1other";
const COMMUNITY = "bitcoin";

function seed(queryClient: QueryClient) {
  const keys = {
    communities: queryKeys.communities({ joined_by: VIEWER }),
    community: queryKeys.community(COMMUNITY, VIEWER),
    profile: queryKeys.profile(VIEWER),
    otherProfile: queryKeys.profile(OTHER),
    userFollowed: queryKeys.userFollowed(VIEWER),
    userBlocked: queryKeys.userBlocked(VIEWER),
    posts: queryKeys.postsRoot(),
    comments: queryKeys.commentsRoot(),
    userPosts: queryKeys.userPostsRoot(),
    search: queryKeys.search("bitcoin", "communities", 20, undefined, VIEWER),
    inbox: queryKeys.inboxRoot(),
  };
  for (const key of Object.values(keys)) {
    queryClient.setQueryData(key, { ok: true });
  }
  return keys;
}

describe("community social cache invalidation", () => {
  test("join/leave invalidates communities, community, profile, userFollowed, posts, search, inbox", async () => {
    const queryClient = new QueryClient();
    const keys = seed(queryClient);
    await invalidateAfterCommunityJoinOrLeave(queryClient, {
      address: VIEWER,
      community: COMMUNITY,
    });
    expect(queryClient.getQueryState(keys.communities)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.community)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.profile)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.userFollowed)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.posts)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.inbox)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.otherProfile)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.userBlocked)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.comments)?.isInvalidated).toBe(false);
  });

  test("preference invalidates community, posts, search, inbox only", async () => {
    const queryClient = new QueryClient();
    const keys = seed(queryClient);
    await invalidateAfterCommunityPreference(queryClient, { community: COMMUNITY });
    expect(queryClient.getQueryState(keys.community)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.posts)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.inbox)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.communities)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.profile)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.userFollowed)?.isInvalidated).toBe(false);
  });

  test("block/unblock invalidates userBlocked, community, communities, profile, posts, comments, userPosts, search, inbox", async () => {
    const queryClient = new QueryClient();
    const keys = seed(queryClient);
    await invalidateAfterCommunityBlockChange(queryClient, {
      address: VIEWER,
      community: COMMUNITY,
    });
    expect(queryClient.getQueryState(keys.userBlocked)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.community)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.communities)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.profile)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.posts)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.comments)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.userPosts)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.inbox)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.otherProfile)?.isInvalidated).toBe(false);
  });

  test("searchRoot prefixes concrete search keys without reshaping them", () => {
    const concrete = queryKeys.search("bitcoin", "communities", 20, undefined, VIEWER);
    const root = queryKeys.searchRoot();
    expect(concrete.slice(0, root.length)).toEqual(root);
    expect(concrete.length).toBeGreaterThan(root.length);
  });
});
