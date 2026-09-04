// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  hasCompletedLaunchThisRuntime,
  markLaunchCompletedThisRuntime,
  resetLaunchCompletedThisRuntime,
  resetStartupHomeReady,
  signalStartupHomeReady,
  waitForStartupHomeReady,
} from "../src/navigation/startup-navigation-readiness";

describe("startup navigation readiness", () => {
  test("launch completion survives Home-ready reset in the same JS runtime", () => {
    resetLaunchCompletedThisRuntime();
    resetStartupHomeReady();
    expect(hasCompletedLaunchThisRuntime()).toBe(false);

    markLaunchCompletedThisRuntime();
    resetStartupHomeReady();

    expect(hasCompletedLaunchThisRuntime()).toBe(true);
    resetLaunchCompletedThisRuntime();
  });

  test("Home-ready can be signaled again after a layout remount reset", async () => {
    resetLaunchCompletedThisRuntime();
    signalStartupHomeReady();
    resetStartupHomeReady();
    const pending = waitForStartupHomeReady();
    signalStartupHomeReady();
    await pending;
    expect(hasCompletedLaunchThisRuntime()).toBe(false);
  });
});
