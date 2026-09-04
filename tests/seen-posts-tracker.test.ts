// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  SEEN_TRACKER_MAX_EXPOSURES,
  needsSeenExposurePrune,
  shouldDropEndedExposure,
} from "../src/services/seen-posts-tracker-policy";

describe("seen-posts tracker exposure bound", () => {
  test("keeps a hard cap for long sessions", () => {
    expect(SEEN_TRACKER_MAX_EXPOSURES).toBe(256);
    expect(needsSeenExposurePrune(256)).toBe(false);
    expect(needsSeenExposurePrune(257)).toBe(true);
  });

  test("drops posts that leave the viewport with no glance progress", () => {
    expect(shouldDropEndedExposure(0)).toBe(true);
    expect(shouldDropEndedExposure(1)).toBe(false);
  });
});
