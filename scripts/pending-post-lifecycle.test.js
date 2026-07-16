import { describe, expect, test } from "bun:test";

import { removePostAliasesFromData } from "../src/api/cache/remove-post-aliases.ts";
import {
  normalizePendingPost,
  prunePendingPosts,
  shouldPersistPendingPost,
} from "../src/stores/pending-posts-lifecycle.ts";

const post = (overrides = {}) => ({
  post_id: "confirmed",
  user_id: "user",
  username: "user",
  timestamp: 1,
  topic: "test",
  root_topic: "test",
  root_post_id: "confirmed",
  title: "title",
  content: "",
  tag: "",
  edited_at: 0,
  thumbnail: "",
  media: [],
  points: 1,
  comments: 0,
  user_vote: 1,
  user_weight: 1,
  ...overrides,
});

describe("pending post lifecycle", () => {
  test("drops confirmed success entries that do not need local video state", () => {
    const confirmed = post({
      optimistic_status: "success",
      optimistic_cached_until: Date.now() + 60_000,
    });
    expect(shouldPersistPendingPost(confirmed)).toBe(false);
    expect(normalizePendingPost(confirmed)).toBeNull();
  });

  test("retains processing metadata without success decoration", () => {
    const processing = post({
      optimistic_status: "success",
      optimistic_draft: { attachmentType: "video" },
      optimistic_video_preview_until: Date.now() + 45_000,
    });
    const normalized = normalizePendingPost(processing);
    expect(normalized).not.toBeNull();
    expect(normalized.optimistic_status).toBeUndefined();
    expect(normalized.optimistic_video_preview_until).toBeDefined();
  });

  test("prunes legacy stale success ghosts", () => {
    expect(prunePendingPosts([
      post({ optimistic_status: "success", optimistic_cached_until: Date.now() + 60_000 }),
      post({ post_id: "pending", optimistic_status: "pending" }),
    ]).map((item) => item.post_id)).toEqual(["pending"]);
  });

  test("removes confirmed and optimistic aliases from persisted cache shapes", () => {
    const data = {
      pages: [{ posts: [
        post({ post_id: "confirmed", optimistic_action_id: "action" }),
        post({ post_id: "optimistic-post-1", optimistic_action_id: "action" }),
        post({ post_id: "other" }),
      ] }],
    };
    const result = removePostAliasesFromData(data, "confirmed", "action");
    expect(result.pages[0].posts.map((item) => item.post_id)).toEqual(["other"]);
  });
});
