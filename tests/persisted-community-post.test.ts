// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { migratePersistedCommunityPost } from "../src/stores/persisted-community-post";

describe("persisted community post migration", () => {
  test("keeps a canonical community and drops topic", () => {
    const migrated = migratePersistedCommunityPost({
      id: "p1",
      community: "News",
      topic: "old-topic",
      title: "Hello",
    });
    expect(migrated).toEqual({
      id: "p1",
      community: "news",
      title: "Hello",
    });
    expect(migrated).not.toHaveProperty("topic");
  });

  test("copies a safe legacy topic when community is missing", () => {
    const migrated = migratePersistedCommunityPost({
      id: "p2",
      topic: " Bitcoin ",
      title: "kept",
    });
    expect(migrated).toEqual({
      id: "p2",
      community: "bitcoin",
      title: "kept",
    });
  });

  test("drops entries that cannot establish a safe community", () => {
    expect(migratePersistedCommunityPost({
      id: "p3",
      community: "bit--coin",
      topic: "Nope!",
      title: "gone",
    })).toBeNull();
  });
});
