// @ts-nocheck -- Bun provides test types at runtime.
import { afterEach, expect, test } from "bun:test";
import { AdultPromptLifecycle } from "../src/services/adult-prompt-lifecycle";
import {
  claimHomeEntryFocus, getHomeEntryFocused, getAdultPromptActive,
  resetHomeEntryPromptOrchestrator, resolveHomeEntryPrompt,
} from "../src/services/home-entry-prompt-orchestrator";

const ready = {
  preferencesHydrated: true, isInitializing: false, isAuthenticated: true,
  isAppActive: true, isHomeFocused: true, hasCurrentUser: true,
  hasSeenAdultPrompt: false, nowMs: 1000, analyticsConsentAsked: false,
  canRequestOsPermissions: true, hasWalletAddress: true,
};
function harness() {
  let frame = 0;
  const frames = new Map();
  const presentations = [];
  let dismisses = 0;
  const errors = [];
  const lifecycle = new AdultPromptLifecycle({
    schedule: (callback) => { frames.set(++frame, callback); return frame; },
    cancel: (id) => frames.delete(id),
    present: (callbacks) => presentations.push(callbacks),
    dismiss: () => { dismisses++; },
    onError: (error) => errors.push(error),
  });
  return {
    lifecycle, presentations, errors,
    get dismisses() { return dismisses; },
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach((f) => f()); },
    open() { this.flush(); presentations.at(-1)?.onChange(0); },
    dismissed() { presentations.at(-1)?.onDismiss(); },
  };
}
afterEach(resetHomeEntryPromptOrchestrator);

test("unhydrated and guest startup cannot prompt; a saved choice survives login", () => {
  expect(resolveHomeEntryPrompt({ ...ready, preferencesHydrated: false })).toBeNull();
  expect(resolveHomeEntryPrompt({ ...ready, isAuthenticated: false })).toBeNull();
  expect(resolveHomeEntryPrompt(ready)).toBe("adult");
  expect(resolveHomeEntryPrompt({ ...ready, hasSeenAdultPrompt: true })).toBe("analytics_consent");
});

for (const enabled of [true, false]) {
  test(`choice ${enabled} is committed exactly once before dismissal and OS prompts`, () => {
    const h = harness();
    let state = { ...ready };
    let writes = 0;
    h.lifecycle.update(true, "session-1");
    h.open();
    const answer = () => {
      writes++;
      state = { ...state, hasSeenAdultPrompt: true, enabled };
      expect(getAdultPromptActive()).toBe(true);
      expect(resolveHomeEntryPrompt(state)).toBeNull();
      h.lifecycle.update(false, "session-1");
    };
    h.lifecycle.complete(answer);
    h.lifecycle.complete(answer);
    expect(writes).toBe(1);
    expect(state.enabled).toBe(enabled);
    expect(h.dismisses).toBe(1);
    expect(resolveHomeEntryPrompt(state)).toBeNull();
    h.dismissed();
    expect(resolveHomeEntryPrompt(state)).toBe("analytics_consent");
    for (let i = 0; i < 20; i++) h.lifecycle.update(false, "session-1");
    expect(h.presentations).toHaveLength(1);
    expect(h.dismisses).toBe(1);
    h.lifecycle.dispose();
    const remount = harness();
    remount.lifecycle.update(resolveHomeEntryPrompt(state) === "adult", "session-2");
    remount.open();
    expect(remount.presentations).toHaveLength(0);
  });
}

test("StrictMode scheduled setup/cleanup and competing consumers never stack sheets", () => {
  const first = harness();
  first.lifecycle.update(true, "a");
  first.lifecycle.dispose();
  first.flush();
  expect(first.presentations).toHaveLength(0);
  const second = harness();
  second.lifecycle.update(true, "a");
  second.open();
  const competitor = harness();
  competitor.lifecycle.update(true, "a");
  competitor.open();
  expect(competitor.presentations).toHaveLength(0);
  competitor.lifecycle.dispose();
  expect(getAdultPromptActive()).toBe(true);
  for (let i = 0; i < 20; i++) second.lifecycle.update(true, "a");
  expect(second.presentations).toHaveLength(1);
});

test("hiding between Gorhom present frame and onChange waits for actual mount", () => {
  const h = harness();
  h.lifecycle.update(true, "a");
  h.flush();
  h.lifecycle.update(false, "a");
  expect(h.dismisses).toBe(0);
  expect(getAdultPromptActive()).toBe(true);
  h.presentations[0].onChange(0);
  expect(h.dismisses).toBe(1);
  h.dismissed();
  expect(getAdultPromptActive()).toBe(false);
  expect(h.presentations).toHaveLength(1);
});

test("dismiss/reopen and stale animation callbacks cannot affect a new generation", () => {
  const h = harness();
  h.lifecycle.update(true, "a");
  h.open();
  const old = h.presentations[0];
  h.lifecycle.update(false, "a");
  h.lifecycle.update(true, "b");
  let writes = 0;
  h.lifecycle.complete(() => writes++);
  expect(writes).toBe(0);
  expect(h.presentations).toHaveLength(1);
  old.onDismiss();
  h.open();
  expect(h.presentations).toHaveLength(2);
  old.onDismiss();
  old.onChange(0);
  old.complete(() => writes++);
  expect(writes).toBe(0);
  expect(getAdultPromptActive()).toBe(true);
  h.lifecycle.complete(() => writes++);
  expect(writes).toBe(1);
  h.lifecycle.dispose();
  h.presentations[1].onDismiss();
  expect(getAdultPromptActive()).toBe(false);
});

test("arbitrary dismissal never acknowledges or recursively presents", () => {
  const h = harness();
  h.lifecycle.update(true, "a");
  h.open();
  h.dismissed();
  h.dismissed();
  h.lifecycle.update(true, "a");
  h.flush();
  expect(h.presentations).toHaveLength(1);
  expect(resolveHomeEntryPrompt(ready)).toBe("adult");
  h.lifecycle.update(false, "a");
  h.lifecycle.update(true, "a");
  h.open();
  expect(h.presentations).toHaveLength(2);
});

test("action errors still close the overlay and release after real dismissal", () => {
  const h = harness();
  h.lifecycle.update(true, "a");
  h.open();
  h.lifecycle.complete(() => { throw new Error("storage unavailable"); });
  expect(h.errors).toHaveLength(1);
  expect(h.dismisses).toBe(1);
  h.dismissed();
  expect(getAdultPromptActive()).toBe(false);
});

test("native presentation errors release the claim without a recursive retry", () => {
  const h = harness();
  h.lifecycle.update(true, "a");
  h.flush();
  h.presentations[0].onError(new Error("native presentation failed"));
  expect(h.errors).toHaveLength(1);
  expect(getAdultPromptActive()).toBe(false);
  h.lifecycle.update(true, "a");
  h.flush();
  expect(h.presentations).toHaveLength(1);
});

test("one Home cleanup cannot clear another Home's focus claim", () => {
  const first = claimHomeEntryFocus();
  const second = claimHomeEntryFocus();
  first(); first();
  expect(getHomeEntryFocused()).toBe(true);
  second();
  expect(getHomeEntryFocused()).toBe(false);
});
