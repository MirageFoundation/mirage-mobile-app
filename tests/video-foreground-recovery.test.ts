// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  resolveVideoForegroundRecovery,
  VIDEO_FOREGROUND_RELOAD_MAX,
} from "../src/components/molecules/video-foreground-recovery";

const armed = {
  needsRecovery: true,
  isAppActive: true,
  shouldPlay: true,
  playerReady: true,
  reloadAttempts: 0,
};

describe("video foreground recovery", () => {
  test("stays idle until a background/lock arms recovery", () => {
    expect(resolveVideoForegroundRecovery({ ...armed, needsRecovery: false })).toBe("idle");
  });

  test("waits when AppState is active before play is requested again", () => {
    expect(resolveVideoForegroundRecovery({ ...armed, shouldPlay: false })).toBe("wait");
    expect(resolveVideoForegroundRecovery({ ...armed, isAppActive: false })).toBe("wait");
  });

  test("nudges a ready player once play is requested in the foreground", () => {
    expect(resolveVideoForegroundRecovery(armed)).toBe("nudge");
  });

  test("reloads a bounded number of times when the player is not ready", () => {
    expect(resolveVideoForegroundRecovery({ ...armed, playerReady: false })).toBe("reload");
    expect(resolveVideoForegroundRecovery({
      ...armed,
      playerReady: false,
      reloadAttempts: VIDEO_FOREGROUND_RELOAD_MAX - 1,
    })).toBe("reload");
    expect(resolveVideoForegroundRecovery({
      ...armed,
      playerReady: false,
      reloadAttempts: VIDEO_FOREGROUND_RELOAD_MAX,
    })).toBe("idle");
  });

  test("waits instead of reloading when reloads are disabled", () => {
    expect(resolveVideoForegroundRecovery({
      ...armed,
      playerReady: false,
      maxReloadAttempts: 0,
    })).toBe("wait");
  });
});
