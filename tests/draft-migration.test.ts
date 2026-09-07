// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { EMPTY_POST_DRAFT, isClearedPostDraft } from "../src/domain/content";
import { migrateDraftStateV0 } from "../src/stores/draft-migration";

describe("draft v0 community migration", () => {
  test("keeps a valid existing community and drops topic", () => {
    const migrated = migrateDraftStateV0({
      draft: {
        community: { id: "News", name: "News", memberCount: 12, isSubscribed: true },
        topic: "old-topic",
        title: "Hello",
        body: "Body",
        contentWarning: ["sensitive"],
        mediaUris: ["https://cdn.example/a.jpg"],
        stickerUrls: ["sticker"],
        linkUrl: null,
        attachmentType: "image",
        tags: ["tag"],
      },
      hasDraft: true,
    });

    expect(migrated.draft.community).toEqual({
      id: "news",
      name: "News",
      memberCount: 12,
      isSubscribed: true,
    });
    expect(migrated.draft).not.toHaveProperty("topic");
    expect(migrated.draft.community).not.toHaveProperty("isNewTopic");
    expect(migrated.draft.title).toBe("Hello");
    expect(migrated.draft.mediaUris).toEqual(["https://cdn.example/a.jpg"]);
    expect(migrated.hasDraft).toBe(true);
  });

  test("converts a valid legacy topic slug into a minimal community", () => {
    const migrated = migrateDraftStateV0({
      draft: {
        community: null,
        topic: " Bitcoin ",
        title: "",
        body: "kept",
        contentWarning: [],
        mediaUris: [],
        linkUrl: null,
        attachmentType: null,
        tags: [],
      },
    });

    expect(migrated.draft.community).toEqual({
      id: "bitcoin",
      name: "bitcoin",
      memberCount: 0,
      isSubscribed: false,
    });
    expect(migrated.hasDraft).toBe(true);
  });

  test("invalid destinations become null and recompute hasDraft", () => {
    const migrated = migrateDraftStateV0({
      draft: {
        community: { id: "bit--coin", name: "bad", memberCount: 1, isSubscribed: false },
        topic: "Nope!",
        title: "",
        body: "",
        contentWarning: [],
        mediaUris: [],
        linkUrl: null,
        attachmentType: null,
        tags: [],
      },
      hasDraft: true,
    });

    expect(migrated.draft.community).toBeNull();
    expect(migrated.hasDraft).toBe(false);
    expect(isClearedPostDraft(migrated.draft)).toBe(true);
    expect(isClearedPostDraft(EMPTY_POST_DRAFT)).toBe(true);
  });
});
