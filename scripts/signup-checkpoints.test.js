import { expect, test } from "bun:test";
import { walletHarness, loadInjectedModule } from "./fixtures/wallet-service-harness.js";
import { deferred, hookHarness } from "./fixtures/auth-hooks-harness.js";
import { isPrebroadcastRegistrationRejection } from "../src/domain/auth/registration-gate.ts";

function signupHarness(phase = "wallet_generated") {
  const h = walletHarness();
  h.service.updateMetadata({ pending: true, hasUsername: false, signup: { phase, operationId: "fixture-operation", username: "fixture", server: "https://fixture.invalid" } });
  h.authSessionCoordinator.begin("old");
  const context = { generation: 1, baseUrl: "https://fixture.invalid" };
  const events = [];
  let broadcast = async () => ({ tx_hash: "fixture-hash" });
  let prepare = async () => ({ synthetic: true });
  let bootstrap = async () => ({ user_status: { username: "anon-fixture" } });
  let tx = async () => ({ found: false });
  const setUsername = loadInjectedModule("../../src/api/write/endpoints/username.ts", {
    api: { post: async () => { events.push(["broadcast", h.service.getWalletMetadata().signup.phase]); return broadcast(); } },
    buildSignedEnvelope: () => prepare(), canonBaseSetUsername: () => {},
    withPowRetry: () => { throw new Error("Signup must not automatically rebroadcast"); },
  }, "setUsername");
  const service = loadInjectedModule("../../src/services/signup-registration.ts", {
    getBootstrap: async (...args) => { events.push(["bootstrap", args[0]]); return bootstrap(...args); },
    getTxStatus: (...args) => tx(...args), setUsername, isPrebroadcastRegistrationRejection,
    apiClient: { getCurrentServerContext: () => context },
    authSessionCoordinator: h.authSessionCoordinator, walletService: h.service,
  }, "({ registerPendingUsername, reconcilePendingSignup })");
  return { ...h, ...service, context, events,
    setBroadcast: (fn) => { broadcast = fn; }, setPrepare: (fn) => { prepare = fn; },
    setBootstrap: (fn) => { bootstrap = fn; }, setTx: (fn) => { tx = fn; },
    checkpoint: () => h.service.getWalletMetadata().signup,
  };
}

test("production username endpoint records registering before broadcast and hash before reconciliation", async () => {
  const h = signupHarness();
  await h.registerPendingUsername("fixture");
  expect(h.events).toEqual([["broadcast", "registering"]]);
  expect(h.checkpoint()).toMatchObject({ phase: "submitted", txHash: "fixture-hash", operationId: "fixture-operation" });
  expect(h.service.getWalletMetadata().hasUsername).toBe(false);
  expect(() => h.service.confirmWallet("old")).toThrow();
  expect(await h.reconcilePendingSignup()).toBe("anon-fixture");
  expect(h.checkpoint().phase).toBe("confirmed");
  h.service.confirmWallet("old");
  expect(h.service.getWalletMetadata().pending).toBe(false);
});

test("prebroadcast failure allows retry with same key, uncertain transport never permits rebroadcast", async () => {
  const h = signupHarness();
  h.setPrepare(async () => { throw new Error("validation failed"); });
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("validation");
  expect(h.checkpoint().phase).toBe("wallet_generated");
  expect(h.events).toHaveLength(0);
  h.setPrepare(async () => ({}));
  h.setBroadcast(async () => { throw new Error("transport timeout"); });
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("timeout");
  expect(h.checkpoint().phase).toBe("registering");
  await expect(h.registerPendingUsername("different")).rejects.toThrow("not yet verified");
  expect(h.events.filter(([event]) => event === "broadcast")).toHaveLength(1);
  expect(h.secure.get("primary")).toBe("mnemonic:old");
});

test("503, timeout, missing hash and absent status retain the key across repeated checks", async () => {
  for (const phase of ["registering", "submitted"]) {
    const h = signupHarness(phase);
    for (const failure of [new Error("503"), new Error("timeout")]) {
      h.setBootstrap(async () => { throw failure; });
      await expect(h.reconcilePendingSignup()).rejects.toThrow();
      expect(h.checkpoint().phase).toBe(phase);
    }
    h.setBootstrap(async () => ({ user_status: { username: null } }));
    await expect(h.reconcilePendingSignup()).rejects.toThrow("retained");
    expect(await h.service.cleanupPendingWallet()).toBe(false);
    expect(h.secure.get("primary")).toBe("mnemonic:old");
    await expect(h.service.createWallet()).rejects.toThrow("already exists");
  }
});

test("only indexed explicit transaction rejection allows safe edit; success without username remains pending", async () => {
  const h = signupHarness("submitted");
  h.service.updateMetadata({ signup: { ...h.checkpoint(), txHash: "fixture-hash" } });
  h.setBootstrap(async () => ({ user_status: { username: null } }));
  for (const response of [{ found: false, success: false }, { found: true, indexed: false, success: false }, { found: true, indexed: true, success: true }]) {
    h.setTx(async () => response);
    await expect(h.reconcilePendingSignup()).rejects.toThrow("not yet verified");
    expect(h.checkpoint().phase).toBe("submitted");
  }
  h.setTx(async () => ({ found: true, indexed: true, success: false }));
  await expect(h.reconcilePendingSignup()).rejects.toThrow("rejected on chain");
  expect(h.checkpoint().phase).toBe("wallet_generated");
  expect(h.checkpoint().txHash).toBeUndefined();
  expect(h.secure.get("primary")).toBe("mnemonic:old");
});

test("registration locks duplicate calls and rejects stale signing sessions before broadcast", async () => {
  const h = signupHarness();
  const prepare = deferred();
  h.setPrepare(() => prepare.promise);
  const first = h.registerPendingUsername("fixture");
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("already running");
  h.authSessionCoordinator.begin("other");
  prepare.resolve({});
  await expect(first).rejects.toThrow("session changed");
  expect(h.events).toHaveLength(0);
  expect(h.secure.get("primary")).toBe("mnemonic:old");
});

test("stale reconciliation, wrong server, and wrong username cannot confirm current wallet", async () => {
  const h = signupHarness("submitted");
  h.setBootstrap(async () => ({ user_status: { username: "unrelated" } }));
  await expect(h.reconcilePendingSignup()).rejects.toThrow("not yet verified");
  const waiting = deferred();
  h.setBootstrap(() => waiting.promise);
  const check = h.reconcilePendingSignup();
  h.authSessionCoordinator.begin("other");
  waiting.resolve({ user_status: { username: "anon-fixture" } });
  await expect(check).rejects.toThrow("session changed");
  expect(h.checkpoint().phase).toBe("submitted");
  h.authSessionCoordinator.begin("old");
  h.context.baseUrl = "https://other.invalid";
  await expect(h.reconcilePendingSignup()).rejects.toThrow("Switch back");
});

test("failed checkpoint persistence prevents broadcast, and invalid operation releases lock", async () => {
  const h = signupHarness();
  const update = h.service.updateMetadata.bind(h.service);
  h.service.updateMetadata = () => {};
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("Unable to save");
  expect(h.events).toHaveLength(0);
  h.service.updateMetadata = update;
  h.authSessionCoordinator.begin(null);
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("No current");
  h.authSessionCoordinator.begin("old");
  await h.registerPendingUsername("fixture");
  expect(h.checkpoint().phase).toBe("submitted");
});

test("legacy pending flags require signed status reconciliation rather than local confirmation", async () => {
  const h = signupHarness();
  h.service.updateMetadata({ signup: undefined, hasUsername: true });
  expect(() => h.service.confirmWallet("old")).toThrow();
  expect(await h.reconcilePendingSignup()).toBe("anon-fixture");
  expect(h.checkpoint()).toMatchObject({ phase: "confirmed", operationId: "legacy:old" });
});

test("production signup hook gates handler, locks same-frame taps, and does not navigate on unmount", async () => {
  const h = signupHarness();
  const hooks = hookHarness();
  const events = [];
  const progress = Object.fromEntries(["startTransaction", "setPhase", "updatePoWProgress", "setSuccess", "setError", "hideModal"].map((name) => [name, (...args) => events.push([name, ...args])]));
  let allowed = false;
  let authorizations = 0;
  const useSignupRegistration = loadInjectedModule("../../src/pages/auth/use-signup-registration.ts", {
    ...hooks, Keyboard: { dismiss() {} }, usePreventRemove() {},
    useTransactionProgress: () => progress,
    useAuthStore: { getState: () => ({ createNewWallet: () => { throw new Error("must retain existing key"); }, setHasUsername() {} }) },
    walletService: h.service, authSessionCoordinator: h.authSessionCoordinator,
    ...h, SIGNUP_PENDING_MESSAGE: "pending", trackEvent() {},
    useRouter: () => ({ push: () => events.push(["navigate"]) }),
  }, "useSignupRegistration");
  const render = () => hooks.render(() => useSignupRegistration("fixture", async () => { authorizations += 1; return allowed; }));
  await render().handleContinue();
  expect(h.events).toHaveLength(0);
  expect(render().createError).toContain("enabled");
  allowed = true;
  const waiting = deferred();
  h.setBootstrap(() => waiting.promise);
  const controller = render();
  const first = controller.handleContinue();
  await controller.handleContinue();
  expect(authorizations).toBe(2);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  hooks.unmount();
  waiting.resolve({ user_status: { username: "anon-fixture" } });
  await first;
  expect(events.some(([name]) => name === "navigate" || name === "setSuccess")).toBe(false);
  expect(h.secure.get("primary")).toBe("mnemonic:old");
});

test("explicit documented prebroadcast 4xx validation is retryable with retained key, not transport lookalikes", async () => {
  for (const error_code of ["registration_disabled", "username_required", "username_too_short", "username_too_long", "username_invalid_format"]) {
    const h = signupHarness();
    const error = Object.assign(new Error("validation"), { response: { status: 400, data: { error_code } } });
    h.setBroadcast(async () => { throw error; });
    await expect(h.registerPendingUsername("fixture")).rejects.toThrow("validation");
    expect(h.checkpoint().phase).toBe("wallet_generated");
    expect(h.secure.get("primary")).toBe("mnemonic:old");
    expect(h.events).toEqual([["broadcast", "registering"]]);
    expect(isPrebroadcastRegistrationRejection({ response: { status: 503, data: { error_code } } })).toBe(false);
    expect(isPrebroadcastRegistrationRejection({ message: error_code })).toBe(false);
  }
});

test("transaction hash returned in error response is checkpointed immediately without any automatic retry", async () => {
  const h = signupHarness();
  h.setBroadcast(async () => { throw Object.assign(new Error("chain rejection"), { response: { status: 400, data: { error_code: "transaction_rejected", tx_hash: "rejected-fixture-hash" } } }); });
  await expect(h.registerPendingUsername("fixture")).rejects.toThrow("chain rejection");
  expect(h.checkpoint()).toMatchObject({ phase: "submitted", txHash: "rejected-fixture-hash" });
  expect(h.events).toEqual([["broadcast", "registering"]]);
});
