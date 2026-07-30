// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { createDuplicateActionGuard } from "../src/utils/duplicate-action-guard";

describe("createDuplicateActionGuard", () => {
  test("rejects duplicate acquisition until the action releases", () => {
    const guard = createDuplicateActionGuard();

    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);

    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });
});
