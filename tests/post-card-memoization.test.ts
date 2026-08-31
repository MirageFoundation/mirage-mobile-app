// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

const componentSources = [
  "src/pages/home/home-post-card-item.tsx",
  "src/components/molecules/post-card.tsx",
  "src/components/molecules/post-card-item.tsx",
  "src/components/molecules/post-card-compact.tsx",
];

const reactDefaultMemoEqual = (
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) => {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return (
    previousKeys.length === nextKeys.length &&
    previousKeys.every(
      (key) => Object.hasOwn(next, key) && Object.is(previous[key], next[key]),
    )
  );
};

describe("post-card memoization contract", () => {
  test("the cited components use React's complete default shallow comparison", async () => {
    for (const path of componentSources) {
      const source = await Bun.file(path).text();
      expect(source).toContain("memo(function");
      expect(source).not.toMatch(/are(?:Home)?PostCard(?:Compact|Item)?PropsEqual/);
    }
  });

  test("every render-relevant post update changes the shallow post prop", () => {
    const author = { id: "author-1", username: "alice", level: 1 };
    const post = {
      id: "post-1",
      title: "Title",
      body: "Body https://example.com",
      media: [{ uri: "image-a", type: "image" }],
      author,
      topic: "news",
      createdAt: 1,
      contentWarnings: ["mature"],
      awards: [{ id: "award-1" }],
      appendices: [{ agent: "agent-1", text: "note" }],
      agentEdited: false,
      likes: 1,
      dislikes: 2,
      comments: 3,
      hasLiked: false,
      hasDisliked: false,
      isFollowing: false,
      optimisticStatus: "pending",
      optimisticError: undefined,
      optimisticActionId: "action-1",
      optimisticVideoPreviewUntil: 1,
      optimisticDraft: { attachmentType: "video" },
      videoProcessing: true,
    };
    const props = { post, contentRevealed: false };
    const changes = {
      title: "Updated title",
      body: "Updated body https://example.org",
      media: [{ uri: "video-b", type: "video" }],
      author: { ...author, username: "bob" },
      topic: "updated-topic",
      createdAt: 2,
      contentWarnings: ["violence"],
      awards: [{ id: "award-2" }],
      appendices: [{ agent: "agent-2", text: "updated note" }],
      agentEdited: true,
      likes: 4,
      dislikes: 5,
      comments: 6,
      hasLiked: true,
      hasDisliked: true,
      isFollowing: true,
      optimisticStatus: "error",
      optimisticError: "failed",
      optimisticActionId: "action-2",
      optimisticVideoPreviewUntil: 2,
      optimisticDraft: { attachmentType: "image" },
      videoProcessing: false,
    };

    for (const [field, value] of Object.entries(changes)) {
      const next = { ...props, post: { ...post, [field]: value } };
      expect(reactDefaultMemoEqual(props, next)).toBe(false);
    }
  });

  test("behavior, reveal, link, moderation, processing, and style props rerender", () => {
    const post = { id: "post-1" };
    const callback = () => {};
    const style = { marginTop: 1 };
    const props = {
      post,
      shareUrl: "https://example.com/p/post-1",
      contentRevealed: false,
      topicDisabled: false,
      allowAutoplay: true,
      screenActive: true,
      isVisible: true,
      isFocused: true,
      isNearVisible: true,
      allowOptimisticMediaPreview: false,
      videoSyncScope: "home",
      style,
      onPress: callback,
      onAuthorPress: callback,
      onTopicPress: callback,
      onLikePress: callback,
      onDislikePress: callback,
      onCommentPress: callback,
      onSharePress: callback,
      onRevealContent: callback,
      onBlockUser: callback,
      onBlockPost: callback,
      onBlockTopic: callback,
      onReport: callback,
      onHidePost: callback,
      onMediaPress: callback,
      onOptimisticRetryPress: callback,
      onLayout: callback,
    };

    expect(reactDefaultMemoEqual(props, { ...props })).toBe(true);

    for (const key of Object.keys(props).filter((key) => key !== "post")) {
      const current = props[key];
      const changed =
        typeof current === "boolean"
          ? !current
          : typeof current === "function"
            ? () => {}
            : typeof current === "string"
              ? `${current}-changed`
              : { marginTop: 2 };
      expect(reactDefaultMemoEqual(props, { ...props, [key]: changed })).toBe(false);
    }
  });
});
