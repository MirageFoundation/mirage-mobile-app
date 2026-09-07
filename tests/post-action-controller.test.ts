// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  createPostCardActionAdapters,
  getSelectedPostFollowState,
  isSelectedPostSaved,
  postActionSelectionReducer,
} from "../src/pages/post/post-action-controller";

const post = {
  id: "post-1",
  title: "Post",
  author: { id: "author-1", username: "alice" },
  community: "news",
};

describe("post action controller adapters", () => {
  test("selection reducer selects, replaces, and clears posts", () => {
    const empty = { selectedPost: null };
    const selected = postActionSelectionReducer(empty, { type: "select", post });
    expect(selected.selectedPost).toBe(post);

    const replacement = { ...post, id: "post-2" };
    expect(
      postActionSelectionReducer(selected, { type: "select", post: replacement })
        .selectedPost,
    ).toBe(replacement);
    expect(postActionSelectionReducer(selected, { type: "clear" })).toEqual(empty);
    expect(postActionSelectionReducer(empty, { type: "clear" })).toBe(empty);
  });

  test("follow state is derived from explicit screen-owned collections", () => {
    expect(
      getSelectedPostFollowState(post, ["author-1"], ["news"]),
    ).toEqual({ isFollowingUser: true, isCommunityJoined: true });
    expect(getSelectedPostFollowState(post, [], [])).toEqual({
      isFollowingUser: false,
      isCommunityJoined: false,
    });
    expect(getSelectedPostFollowState(null, ["author-1"], ["news"])).toEqual({
      isFollowingUser: false,
      isCommunityJoined: false,
    });
  });

  test("saved state uses the selected post id without retaining store objects", () => {
    const savedIds = new Set(["post-1"]);
    expect(isSelectedPostSaved(post, savedIds)).toBe(true);
    expect(isSelectedPostSaved({ ...post, id: "post-2" }, savedIds)).toBe(false);
    expect(isSelectedPostSaved(null, savedIds)).toBe(false);
  });

  test("card adapters delegate domain arguments without leaking post-card extras", () => {
    const calls = [];
    const actions = createPostCardActionAdapters({
      openOptions: (value) => calls.push(["open", value.id]),
      followUser: (...args) => calls.push(["follow-user", ...args]),
      toggleCommunityMembership: (...args) => calls.push(["join-community", ...args]),
      upvote: (...args) => calls.push(["upvote", ...args]),
      downvote: (...args) => calls.push(["downvote", ...args]),
      requestBlockUser: (...args) => calls.push(["block-user", ...args]),
      requestBlockPost: (...args) => calls.push(["block-post", ...args]),
      requestBlockCommunity: (...args) => calls.push(["block-community", ...args]),
      requestReportPost: (...args) => calls.push(["report", ...args]),
    });

    actions.openOptions(post);
    actions.blockUser("post-1", "author-1", "alice");
    actions.blockPost("post-1");
    actions.blockCommunity("post-1", "news");
    actions.report("post-1");

    expect(calls).toEqual([
      ["open", "post-1"],
      ["block-user", "author-1", "alice"],
      ["block-post", "post-1"],
      ["block-community", "news"],
      ["report", "post-1"],
    ]);
  });
});
