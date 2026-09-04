// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EMPTY_POST_DRAFT, isClearedPostDraft } from "../src/domain/content";

describe("create form reset after publish", () => {
  test("empty draft clears title, topic, and category fields", () => {
    expect(isClearedPostDraft(EMPTY_POST_DRAFT)).toBe(true);
    expect(isClearedPostDraft({
      ...EMPTY_POST_DRAFT,
      title: "Kept title",
      community: { id: "news", name: "news", memberCount: 0, isSubscribed: true },
    })).toBe(false);
  });

  test("successful publish resets compose and draft before leaving create", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/pages/create/use-create-submit-flow.ts"),
      "utf8",
    );
    const enqueueIndex = source.indexOf("enqueueNetworkPost(mediaUrls);");
    const resetComposeIndex = source.indexOf("resetComposeState();", enqueueIndex);
    const clearDraftIndex = source.indexOf("clearDraft();", enqueueIndex);

    expect(enqueueIndex).toBeGreaterThan(-1);
    expect(resetComposeIndex).toBeGreaterThan(enqueueIndex);
    expect(clearDraftIndex).toBeGreaterThan(resetComposeIndex);
    expect(source).toContain("resetComposeState();");
  });
});
