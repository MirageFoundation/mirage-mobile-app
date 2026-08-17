// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  createMediaPostDetailFooterContract,
  createMediaPostDetailMeasurementFooterContract,
  createMediaPostDetailSheetController,
} from "../src/pages/post/media-post-detail-contracts";

const noop = () => {};

function createPost(overrides = {}) {
  return {
    id: "post-1",
    title: "A post",
    body: "Body",
    author: { id: "author-1", username: "alice" },
    topic: "news",
    likes: 2,
    dislikes: 1,
    comments: 3,
    createdAt: 1,
    ...overrides,
  };
}

function createPostActions(overrides = {}) {
  return {
    authorPress: noop,
    authorIdPress: noop,
    followAuthor: noop,
    followTopic: noop,
    upvote: noop,
    downvote: noop,
    comment: noop,
    share: noop,
    blockUser: noop,
    blockPost: noop,
    blockTopic: noop,
    reportPost: noop,
    hidePost: noop,
    expandSheet: noop,
    ...overrides,
  };
}

function createVideoControls(overrides = {}) {
  return {
    isVideo: true,
    isPlaying: true,
    positionMs: 1200,
    durationMs: 5000,
    isMuted: false,
    playPause: noop,
    seek: noop,
    muteToggle: noop,
    ...overrides,
  };
}

describe("media post detail feature contracts", () => {
  test("the sheet controller keeps a stable cohesive top-level shape", () => {
    const groups = {
      threadState: { comments: [] },
      postState: { post: createPost() },
      postActions: createPostActions(),
      commentActions: { upvote: noop },
      videoControls: createVideoControls(),
      sheetLayout: { snapPoints: [100, "100%"] },
    };

    const controller = createMediaPostDetailSheetController(groups);

    expect(controller).toBe(groups);
    expect(Object.keys(controller).sort()).toEqual([
      "commentActions",
      "postActions",
      "postState",
      "sheetLayout",
      "threadState",
      "videoControls",
    ]);
  });

  test("the footer adapter derives follow state and delegates actions unchanged", () => {
    let upvotes = 0;
    let seeks = 0;
    const actions = createPostActions({ upvote: () => upvotes++ });
    const videoControls = createVideoControls({ seek: (ms) => (seeks += ms) });
    const post = createPost();

    const footer = createMediaPostDetailFooterContract(
      {
        post,
        currentUserId: "viewer-1",
        followedUsers: ["author-1"],
        followedTopics: ["news"],
        isOwnPost: false,
        shareUrl: "https://example.com/p/post-1",
      },
      actions,
      videoControls,
      { isExpanded: true, hideVideoControls: true },
    );

    expect(footer.actions).toBe(actions);
    expect(footer.videoControls).toBe(videoControls);
    expect(footer.followState).toEqual({
      isFollowing: true,
      isTopicFollowed: true,
      topic: "news",
      isOwnAuthor: false,
    });
    footer.actions.upvote();
    footer.videoControls.seek(250);
    expect(upvotes).toBe(1);
    expect(seeks).toBe(250);
  });

  test("the measurement adapter is inert without changing structural data", () => {
    let delegatedActions = 0;
    const footer = createMediaPostDetailFooterContract(
      {
        post: createPost({ isFollowing: false }),
        currentUserId: "author-1",
        followedUsers: ["author-1"],
        followedTopics: [],
        isOwnPost: true,
        shareUrl: "https://example.com/p/post-1",
      },
      createPostActions({ upvote: () => delegatedActions++ }),
      createVideoControls({ playPause: () => delegatedActions++ }),
      { isExpanded: true, hideVideoControls: true },
    );

    const measurement = createMediaPostDetailMeasurementFooterContract(footer);
    measurement.actions.upvote();
    measurement.videoControls.playPause();

    expect(delegatedActions).toBe(0);
    expect(measurement.post).toBe(footer.post);
    expect(measurement.followState).toBe(footer.followState);
    expect(measurement.presentation).toEqual({
      isExpanded: false,
      hideVideoControls: false,
    });
    expect(measurement.videoControls).toMatchObject({
      isVideo: true,
      isPlaying: false,
      positionMs: 0,
      durationMs: 5000,
      isMuted: false,
    });
  });
});
