// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { UNSPECIFIED_SERVED_LENS } from "../src/domain/communities";
import {
  migratePendingPostV3,
  migratePendingPostsState,
} from "../src/stores/pending-posts-lifecycle";

const pending = (overrides = {}) => ({
  post_id: "pending-1",
  user_id: "user",
  username: "user",
  timestamp: 1,
  topic: "Bitcoin",
  root_topic: "Bitcoin",
  root_post_id: "pending-1",
  title: "title",
  content: "",
  tag: "",
  edited_at: 0,
  thumbnail: "",
  media: [],
  points: 1,
  comments: 0,
  user_vote: 0,
  user_weight: 0,
  optimistic_status: "pending",
  ...overrides,
});

describe("pending posts v5 migration", () => {
  test("migrates safe topic to community fields and fills served lens", () => {
    const migrated = migratePendingPostV3(pending({
      optimistic_draft: {
        topic: " Ethereum ",
        title: "draft",
        body: "",
        contentWarning: [],
        mediaUris: ["file://local"],
        linkUrl: null,
        attachmentType: "image",
        tags: [],
      },
    }));

    expect(migrated.community).toBe("bitcoin");
    expect(migrated.root_community).toBe("bitcoin");
    expect(migrated).not.toHaveProperty("topic");
    expect(migrated).not.toHaveProperty("root_topic");
    expect(migrated.lens).toEqual(UNSPECIFIED_SERVED_LENS);
    expect(migrated.thread_locked).toBe(false);
    expect(migrated.optimistic_draft.community).toEqual({
      id: "ethereum",
      name: "ethereum",
      memberCount: 0,
      isSubscribed: false,
    });
    expect(migrated.optimistic_draft).not.toHaveProperty("topic");
  });

  test("rejects entries with no safe community and preserves remaining posts", () => {
    const migrated = migratePendingPostsState({
      posts: [
        pending({ post_id: "keep" }),
        pending({ post_id: "drop", topic: "Nope!", root_topic: "Nope!" }),
        pending({
          post_id: "expired",
          optimistic_status: "success",
          optimistic_cached_until: Date.now() + 60_000,
        }),
      ],
    });

    expect(migrated.posts.map((post) => post.post_id)).toEqual(["keep"]);
  });

  test("strips agent appendix fields while keeping the draft", () => {
    const migrated = migratePendingPostV3(pending({
      community: "news",
      agent_edited: true,
      appendices: [{ agent: "mirage1agent", text: "note" }],
    }));
    expect(migrated.community).toBe("news");
    expect(migrated).not.toHaveProperty("agent_edited");
    expect(migrated).not.toHaveProperty("appendices");
  });
});
