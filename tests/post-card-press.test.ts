// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { shouldTriggerPostCardPressHaptic } from "../src/components/molecules/post-card-press";

describe("post card press haptics", () => {
  test("skips haptics for inert body text without a press action", () => {
    expect(shouldTriggerPostCardPressHaptic(undefined)).toBe(false);
    expect(shouldTriggerPostCardPressHaptic(null)).toBe(false);
  });

  test("keeps haptics for tappable feed cards", () => {
    expect(shouldTriggerPostCardPressHaptic(() => {})).toBe(true);
  });
});
