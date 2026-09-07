import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { loadInjectedModule } from "./fixtures/wallet-service-harness.js";
import { hookHarness, deferred } from "./fixtures/auth-hooks-harness.js";

function secretHarness() {
  let clipboard = "";
  const timers = [], writes = [], capture = [];
  const service = loadInjectedModule("../../src/services/secret-screen.ts", {
    Clipboard: { getStringAsync: async () => clipboard, setStringAsync: async (value) => { clipboard = value; writes.push(value); } },
    Crypto: { CryptoDigestAlgorithm: { SHA256: "sha256" }, digestStringAsync: async (_, value) => createHash("sha256").update(value).digest("hex") },
    ScreenCapture: Object.fromEntries(["isAvailableAsync", "preventScreenCaptureAsync", "allowScreenCaptureAsync", "enableAppSwitcherProtectionAsync", "disableAppSwitcherProtectionAsync"].map((name) => [name, async () => { capture.push(name); return true; }])),
    Platform: { OS: "ios" }, setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
  }, "({ acquireSecretScreen, copySecretWithExpiry, clearSecretClipboardIfUnchanged })");
  return { ...service, timers, writes, capture, setClipboard: (value) => { clipboard = value; }, clipboard: () => clipboard };
}
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

test("shared settings/signup/login capture claims protect until last screen releases", async () => {
  const h = secretHarness();
  const [first, second] = await Promise.all([h.acquireSecretScreen(), h.acquireSecretScreen()]);
  expect(h.capture).toEqual(["isAvailableAsync", "preventScreenCaptureAsync", "enableAppSwitcherProtectionAsync"]);
  await first();
  await first();
  expect(h.capture).toHaveLength(3);
  await second();
  expect(h.capture.slice(-2)).toEqual(["allowScreenCaptureAsync", "disableAppSwitcherProtectionAsync"]);
});

test("digest-checked expiry clears only app-copied text and preserves newer clipboard contents", async () => {
  const h = secretHarness();
  expect(await h.copySecretWithExpiry("synthetic nonsecret fixture", () => true)).toBe(true);
  expect(h.timers[0].delay).toBe(30_000);
  h.setClipboard("user copied newer text");
  h.timers.shift().fn(); await flush();
  expect(h.clipboard()).toBe("user copied newer text");
  expect(h.writes).toHaveLength(1);
  await h.copySecretWithExpiry("second synthetic fixture", () => true);
  h.timers.shift().fn(); await flush();
  expect(h.clipboard()).toBe("");
});

test("copy cannot publish after concealment; late copy completion expires immediately", async () => {
  const h = secretHarness();
  expect(await h.copySecretWithExpiry("synthetic fixture", () => false)).toBe(false);
  expect(h.writes).toHaveLength(0);
  let checks = 0;
  expect(await h.copySecretWithExpiry("synthetic fixture", () => ++checks === 1)).toBe(false);
  expect(h.timers[0].delay).toBe(0);
  h.timers.shift().fn(); await flush();
  expect(h.clipboard()).toBe("");
});

test("production secret hook hides on inactive/blur and requires explicit reveal on resume without biometric prerequisite", async () => {
  const hooks = hookHarness();
  let focusCleanup, listener;
  const AppState = { currentState: "active", addEventListener: (_, fn) => { listener = fn; return { remove() {} }; } };
  const claims = [];
  let registered = false;
  const useSecretScreen = loadInjectedModule("../../src/hooks/use-secret-screen.ts", {
    ...hooks, AppState, Keyboard: { dismiss() {} },
    useFocusEffect: (fn) => { if (!registered) { registered = true; focusCleanup = fn(); } },
    acquireSecretScreen: async () => async () => { claims.push("released"); },
  }, "useSecretScreen");
  const render = () => hooks.render(useSecretScreen);
  expect(render().visible).toBe(false);
  await flush();
  expect(render().protection).toBe("ready");
  render().reveal(); expect(render().visible).toBe(true);
  AppState.currentState = "inactive"; listener("inactive");
  expect(render().visible).toBe(false);
  expect(render().isVisible()).toBe(false);
  AppState.currentState = "active"; listener("active");
  expect(render().visible).toBe(false);
  render().reveal(); expect(render().visible).toBe(true);
  focusCleanup();
  expect(render().isVisible()).toBe(false);
  await flush(); expect(claims).toEqual(["released"]);
});

test("late capture setup after unmount releases protection rather than revealing secrets", async () => {
  const hooks = hookHarness(), waiting = deferred();
  let cleanup, released = 0;
  const useSecretScreen = loadInjectedModule("../../src/hooks/use-secret-screen.ts", {
    ...hooks, AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, Keyboard: { dismiss() {} },
    useFocusEffect: (fn) => { cleanup = fn(); }, acquireSecretScreen: () => waiting.promise,
  }, "useSecretScreen");
  const screen = hooks.render(useSecretScreen);
  cleanup(); hooks.unmount();
  waiting.resolve(async () => { released += 1; });
  await flush();
  expect(released).toBe(1);
  expect(screen.isVisible()).toBe(false);
});
