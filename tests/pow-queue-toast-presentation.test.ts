// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { createPowQueueToastPresentationSelector } from "../src/services/pow-queue-toast-presentation";

const action = (id: string, overrides = {}) => ({
  id,
  type: "post",
  label: `Action ${id}`,
  execute: async () => undefined,
  ...overrides,
});

const state = (overrides = {}) => ({
  queue: [],
  currentAction: null,
  preparingAction: null,
  completedCount: 0,
  totalCount: 0,
  lastCompletedAction: null,
  successOverlay: null,
  ...overrides,
});

describe("PoW queue toast presentation selector", () => {
  test("retains its output for unrelated and non-leading queue progress", () => {
    const select = createPowQueueToastPresentationSelector();
    const first = action("first");
    const unrelated = action("unrelated", { progress: 0.1 });
    const initial = select(
      state({ queue: [first, unrelated], totalCount: 2, currentProgress: 0.1 }),
    );
    const updated = select(
      state({
        queue: [first, { ...unrelated, progress: 0.9 }],
        totalCount: 2,
        currentProgress: 0.9,
      }),
    );

    expect(updated).toBe(initial);
  });

  test("updates when the presented action transitions from queued to active", () => {
    const select = createPowQueueToastPresentationSelector();
    const active = action("active");
    const queued = select(state({ queue: [active], totalCount: 1 }));
    const processing = select(
      state({ currentAction: active, totalCount: 1 }),
    );

    expect(processing).not.toBe(queued);
    expect(queued.nextAction?.id).toBe("active");
    expect(processing.currentAction?.id).toBe("active");
    expect(processing.nextAction).toBeNull();
  });

  test("updates when a preparing action begins submitting", () => {
    const select = createPowQueueToastPresentationSelector();
    const preparing = action("vote", { type: "upvote" });
    const initial = select(
      state({ preparingAction: preparing, totalCount: 1 }),
    );
    const submitting = select(
      state({
        preparingAction: { ...preparing, phase: "submitting" },
        totalCount: 1,
      }),
    );

    expect(submitting).not.toBe(initial);
    expect(initial.preparingAction?.phase).toBeUndefined();
    expect(submitting.preparingAction?.phase).toBe("submitting");
  });

  test("updates aggregate counts and the first visible action on add or remove", () => {
    const select = createPowQueueToastPresentationSelector();
    const first = action("first");
    const second = action("second");
    const initial = select(state());
    const added = select(state({ queue: [first, second], totalCount: 2 }));
    const removed = select(
      state({ queue: [second], completedCount: 1, totalCount: 2 }),
    );

    expect(added).not.toBe(initial);
    expect(added.nextAction?.id).toBe("first");
    expect(added.totalCount).toBe(2);
    expect(removed).not.toBe(added);
    expect(removed.nextAction?.id).toBe("second");
    expect(removed.completedCount).toBe(1);
  });

  test("stays hidden and stable for hidden-only queue changes", () => {
    const select = createPowQueueToastPresentationSelector();
    const initial = select(state());
    const hidden = select(
      state({
        queue: [action("hidden", { showProgress: false, progress: 0.5 })],
      }),
    );
    const hiddenUpdated = select(
      state({
        queue: [action("hidden", { showProgress: false, progress: 0.9 })],
      }),
    );

    expect(hidden.hasVisibleWork).toBe(false);
    expect(hidden).toBe(initial);
    expect(hiddenUpdated).toBe(initial);
  });
});
