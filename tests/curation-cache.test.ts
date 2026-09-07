// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../src/api/read/query-keys";
import {
  invalidateAfterCurationModerationChange,
  invalidateAfterCurationTeamChange,
  patchSettledModerationLeaf,
} from "../src/api/cache/curation-cache";

const VIEWER = "mirage1viewer";
const COMMUNITY = "bitcoin";
const TEAM = 3;
const POST = "aa".repeat(32);

describe("curation cache", () => {
  test("team changes invalidate team/list/detail roots without clearing all queries", async () => {
    const queryClient = new QueryClient();
    const teams = queryKeys.communityTeams(COMMUNITY);
    const detail = queryKeys.community(COMMUNITY, VIEWER);
    const other = queryKeys.profile("mirage1other");
    queryClient.setQueryData(teams, { ok: true });
    queryClient.setQueryData(detail, { ok: true });
    queryClient.setQueryData(other, { ok: true });
    await invalidateAfterCurationTeamChange(queryClient, {
      community: COMMUNITY,
      teamId: TEAM,
      address: VIEWER,
    });
    expect(queryClient.getQueryState(teams)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(other)).toEqual({ ok: true });
  });

  test("patches only the moderation leaf and preserves served lens elsewhere", async () => {
    const queryClient = new QueryClient();
    const moderationKey = queryKeys.communityTeamModeration(COMMUNITY, TEAM, VIEWER, [POST]);
    const postKey = queryKeys.postsRoot();
    queryClient.setQueryData(moderationKey, {
      community: COMMUNITY,
      team_id: String(TEAM),
      items: [{
        post_id: POST,
        post_hidden: false,
        user_hidden: false,
        thread_locked: false,
        post_tag: null,
      }],
    });
    queryClient.setQueryData(postKey, {
      lens: { requested: "effective", effective_mode: 0, effective_team_id: 3 },
    });
    const hiddenPosts = queryKeys.communityTeamHiddenPostsRoot(COMMUNITY, TEAM);
    queryClient.setQueryData(hiddenPosts, { ok: true });
    patchSettledModerationLeaf(queryClient, {
      community: COMMUNITY,
      teamId: TEAM,
      viewer: VIEWER,
      postIds: [POST],
      postId: POST,
      patch: { post_hidden: true, post_tag: "" },
    });
    const patched = queryClient.getQueryData(moderationKey);
    expect(patched.items[0].post_hidden).toBe(true);
    expect(patched.items[0].post_tag).toBe("");
    expect(queryClient.getQueryData(postKey).lens).toEqual({
      requested: "effective",
      effective_mode: 0,
      effective_team_id: 3,
    });
    await invalidateAfterCurationModerationChange(queryClient, {
      community: COMMUNITY,
      teamId: TEAM,
      kind: "post",
    });
    expect(queryClient.getQueryState(queryKeys.postsRoot())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(hiddenPosts)?.isInvalidated).toBe(true);
  });
});
