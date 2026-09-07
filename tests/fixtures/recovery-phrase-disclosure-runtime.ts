// @ts-nocheck -- Isolated native-free hook harness with deferred biometric/export results.
/* eslint-disable react-hooks/rules-of-hooks -- Executes the production hook in an isolated slot harness. */
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { authSessionCoordinator } from "../../src/services/auth-session-coordinator";
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let slots = [], cursor = 0, cleanups = [], focusCleanup;
const depsEqual = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const effect = (fn, deps) => {
  const i = cursor++, previous = slots[i];
  if (!previous || !depsEqual(previous.deps, deps)) {
    previous?.cleanup?.();
    slots[i] = { deps, cleanup: fn() };
    cleanups[i] = () => slots[i]?.cleanup?.();
  }
};
mock.module("react", () => ({
  useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
  useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value; }]; },
  useCallback: (fn, deps) => { const i = cursor++; if (!slots[i] || !depsEqual(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
  useEffect: effect,
}));
mock.module("expo-router/react-navigation", () => ({ useFocusEffect: fn => effect(() => { focusCleanup = fn(); return focusCleanup; }, [fn]) }));
const listeners = new Set(), sessionListeners = new Set();
const AppState = { currentState: "active", addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
const change = state => { AppState.currentState = state; for (const fn of listeners) fn(state); };
const sessionChange = address => { authSessionCoordinator.begin(address); for (const fn of sessionListeners) fn(); };
mock.module("react-native", () => ({ AppState, Platform: { OS: "ios" } }));
mock.module("../../src/stores/auth-store", () => ({ useAuthStore: { subscribe: fn => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); } } }));
let auth, exported, exportCalls = 0, authCalls = 0, hardware = true;
mock.module("expo-local-authentication", () => ({ hasHardwareAsync: async () => hardware, isEnrolledAsync: async () => true, authenticateAsync: () => { authCalls++; return auth.promise; } }));
mock.module("../../src/services/wallet-service", () => ({ walletService: { exportMnemonic: () => { exportCalls++; return exported.promise; } } }));
mock.module("@sentry/react-native", () => ({ captureException() {} }));
let capture = 0, switcher = 0, clipboard = "";
mock.module("expo-screen-capture", () => ({ isAvailableAsync: async () => true, preventScreenCaptureAsync: async () => { capture++; }, allowScreenCaptureAsync: async () => { capture--; }, enableAppSwitcherProtectionAsync: async () => { switcher++; }, disableAppSwitcherProtectionAsync: async () => { switcher--; } }));
mock.module("expo-clipboard", () => ({ getStringAsync: async () => clipboard, setStringAsync: async value => { clipboard = value; } }));
mock.module("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "sha256" }, digestStringAsync: async (_, value) => `mock-digest:${value}` }));
const timers = new Map(); let timerId = 0;
globalThis.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
const runTimers = async delay => { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } await flush(); };
const { useRecoveryPhraseDisclosure } = await import("../../src/pages/recovery-phrase/use-recovery-phrase-disclosure");
const render = () => { cursor = 0; return useRecoveryPhraseDisclosure(); };
const mount = async () => {
  slots = []; cleanups = []; AppState.currentState = "active"; sessionChange("test-wallet");
  auth = deferred(); exported = deferred(); exportCalls = 0; authCalls = 0; hardware = true;
  render(); await flush(); assert.equal(render().captureProtection, "ready");
  assert.equal(capture, 1); assert.equal(switcher, 1);
};
const unmount = async () => { for (const cleanup of cleanups) cleanup?.(); await flush(); assert.equal(capture, 0); assert.equal(switcher, 0); timers.clear(); };
const start = async () => { const task = render().reveal(); await flush(); assert.equal(authCalls, 1); return { task }; };
const hidden = () => assert.equal(render().snapshot.phrase, null);
// Never use a real or valid wallet mnemonic in this harness.
const sample = "synthetic-secret-test-value";
for (const order of ["success-before-active", "active-before-success", "no-inactive"]) {
  await mount(); const { task } = await start();
  if (order !== "no-inactive") change("inactive");
  if (order === "active-before-success") change("active");
  auth.resolve({ success: true }); await flush();
  if (order === "success-before-active") { hidden(); assert.equal(exportCalls, 0); change("active"); await flush(); }
  assert.equal(exportCalls, 1); exported.resolve(sample); await task;
  assert.equal(render().snapshot.phrase, sample); assert.equal(render().errorMessage, null);
  await render().copy(); assert.equal(clipboard, sample);
  await runTimers(30_000); assert.equal(clipboard, "");
  await render().copy(); clipboard = "unrelated clipboard";
  await runTimers(30_000); assert.equal(clipboard, "unrelated clipboard");
  change("inactive"); hidden(); change("active"); hidden();
  await unmount();
}
for (const failure of ["cancel", "failure", "background", "blur", "unmount", "wallet-switch", "logout"]) {
  await mount(); const { task } = await start(); change("inactive");
  if (failure === "background") { change("background"); change("active"); }
  if (failure === "blur") focusCleanup();
  if (failure === "unmount") await unmount();
  if (failure === "wallet-switch") sessionChange("different-wallet");
  if (failure === "logout") sessionChange(null);
  auth.resolve({ success: !["cancel", "failure"].includes(failure), error: "user_cancel" });
  await flush(); change("active"); await task;
  hidden(); assert.equal(exportCalls, 0);
  if (failure !== "unmount") await unmount();
}
for (const invalidate of ["background", "blur", "wallet-switch", "logout"]) {
  await mount(); const { task } = await start(); change("inactive");
  auth.resolve({ success: true }); await flush(); hidden();
  if (invalidate === "background") change("background");
  if (invalidate === "blur") focusCleanup();
  if (invalidate === "wallet-switch") sessionChange("other");
  if (invalidate === "logout") sessionChange(null);
  change("active"); await task; hidden(); assert.equal(exportCalls, 0); await unmount();
}
for (const invalidate of ["inactive", "background", "blur", "unmount", "wallet-switch", "logout"]) {
  await mount(); const { task } = await start(); auth.resolve({ success: true }); await flush();
  assert.equal(exportCalls, 1);
  if (["inactive", "background"].includes(invalidate)) change(invalidate);
  if (invalidate === "blur") focusCleanup();
  if (invalidate === "unmount") await unmount();
  if (invalidate === "wallet-switch") sessionChange("other");
  if (invalidate === "logout") sessionChange(null);
  exported.resolve(sample); await task; change("active"); hidden();
  if (invalidate !== "unmount") await unmount();
}
for (const invalidate of ["background", "blur", "wallet-switch", "logout"]) {
  await mount(); const { task } = await start(); auth.resolve({ success: true }); await flush();
  exported.resolve(sample); await task; assert.equal(render().snapshot.phrase, sample);
  if (invalidate === "background") change("background");
  if (invalidate === "blur") focusCleanup();
  if (invalidate === "wallet-switch") sessionChange("other");
  if (invalidate === "logout") sessionChange(null);
  hidden(); change("active"); hidden(); await unmount();
}
await mount();
const { task: copyTask } = await start();
await render().reveal(); assert.equal(authCalls, 1);
auth.resolve({ success: true }); await flush(); exported.resolve(sample); await copyTask;
clipboard = "keep-existing";
const copy = render().copy(); change("background"); await copy;
assert.equal(clipboard, "keep-existing"); await unmount();
await mount();
const preflight = render().reveal(); change("inactive"); await preflight;
hidden(); assert.equal(authCalls, 0); await unmount();
await mount(); hardware = false; await render().reveal(); hidden(); assert.equal(authCalls, 0); await unmount();
console.log("Recovery disclosure lifecycle mock checks passed");
