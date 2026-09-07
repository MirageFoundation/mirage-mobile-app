import { expect, test } from "bun:test";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveAuthSessionStatus, resolvePendingWalletStartup } from "../src/domain/auth/session.ts";
import { WalletCleanupError } from "../src/services/wallet-local-session.ts";
import { WalletRecoveryError } from "../src/services/wallet-secure-transactions.ts";
import { walletHarness, loadInjectedModule } from "./fixtures/wallet-service-harness.js";
import { useDeepLinkStore } from "../src/stores/deep-link-store.ts";
import { isProtectedEntryReady, canEnterProtectedRoute } from "../src/navigation/auth-entry-policy.ts";
import { navigationHooksHarness } from "./fixtures/navigation-hooks-harness.js";
import { hookHarness } from "./fixtures/auth-hooks-harness.js";
import { normalizeRecoveryPhrase, PHRASE_WORD_COUNTS } from "../src/domain/auth/phrase-input.ts";

function authHarness() {
  const wallet = walletHarness();
  let bootstrapCalls = 0;
  let completeBootstrap;
  const bootstrap = new Promise((resolve) => { completeBootstrap = resolve; });
  const noop = () => {};
  const store = { getState: () => ({ reset: noop, clearAll: noop, resetForLogout: noop, clearDraft: noop }), setState: noop };
  const persisted = new Map([["auth-storage", JSON.stringify({ state: { isLoggedIn: true, walletAddress: "old", publicKeyBase64: "public:old", hasOnboarded: true, userLevel: 0 }, version: 0 })]]);
  const auth = loadInjectedModule("../../src/stores/auth-store.ts", {
    create, createJSONStorage, persist,
    mmkvStorage: { getItem: (key) => persisted.get(key) ?? null, setItem: (key, value) => { persisted.set(key, value); }, removeItem: (key) => { persisted.delete(key); } },
    Sentry: { setUser: noop, captureException: noop, captureMessage: noop, addBreadcrumb: noop },
    isCompletedApiRead: () => false, isReadCancellation: () => false,
    walletService: wallet.service,
    WalletCleanupError, WalletRecoveryError,
    usePreferencesStore: store, useHomePostCardStore: store, useContentModerationStore: store,
    useInboxStore: store, useDraftStore: store, useDeepLinkStore,
    clearWalletScopedState: noop, selectWalletStorageNamespace: async () => {},
    removePersistedQueryCache: noop, getServerIdentity: () => "fixture-server",
    identifyUser: noop, registerTierSuperProperty: noop, resetAnalyticsIdentity: noop,
    trackEvent: noop, updateUserProfile: noop, getTierName: () => "Free",
    resolveAuthSessionStatus, resolvePendingWalletStartup,
    addAuthBootstrapBreadcrumb: noop,
    bootstrapAnonymousAfterLogout: (done) => done(),
    bootstrapAnonymousStartup: async () => {},
    bootstrapAuthSession: () => { bootstrapCalls += 1; return bootstrap; },
    resolveAndCacheAuthUserStatus: async () => ({ username: "fixture", hasUsername: true, userLevel: 1, tier: "Subscriber" }),
    startAuthUserStatusBootstrap: noop,
    authSessionCoordinator: wallet.authSessionCoordinator,
  }, "useAuthStore");
  return { ...wallet, auth, completeBootstrap, get bootstrapCalls() { return bootstrapCalls; }, get derives() { return wallet.derives; } };
}

async function flush() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

test("persisted login is not enabled before secure identity verification; local startup does not await backend", async () => {
  const h = authHarness();
  expect(h.auth.getState().isLoggedIn).toBe(false);
  expect(h.auth.getState().walletAddress).toBeNull();
  const first = h.auth.getState().initializeWallet();
  const second = h.auth.getState().initializeWallet();
  expect(first).toBe(second);
  const result = await Promise.race([first.then(() => "local-ready"), new Promise((resolve) => setTimeout(() => resolve("blocked"), 100))]);
  expect(result).toBe("local-ready");
  expect(h.auth.getState()).toMatchObject({ isInitializing: false, isLoggedIn: true, walletAddress: "old", isBootstrapping: true });
  expect(h.bootstrapCalls).toBe(1);
  expect(h.calls).toHaveLength(4);
  for (let index = 0; index < 10; index++) expect(isProtectedEntryReady(h.auth.getState())).toBe(true);
  expect(h.calls).toHaveLength(4);
  expect(h.derives).toBe(1);
  await h.auth.getState().initializeWallet();
  expect(h.bootstrapCalls).toBe(1);
});

test("secure metadata mismatch removes all exposed session and recovery phrase state", async () => {
  const h = authHarness();
  h.publicStorage.set("meta", JSON.stringify({ address: "other", publicKeyBase64: "public:other" }));
  h.auth.setState({ recoveryPhrase: "synthetic-pending-fixture" });
  await h.auth.getState().initializeWallet();
  expect(h.auth.getState()).toMatchObject({ isInitializing: false, isLoggedIn: false, walletAddress: null, recoveryPhrase: null, user: null });
  expect(h.auth.getState().walletError).toContain("Recovery is required");
  expect(h.bootstrapCalls).toBe(0);
});

test("logout rejects incomplete cleanup, removes UI secrets immediately, and fences old bootstrap", async () => {
  const h = authHarness();
  await h.auth.getState().initializeWallet();
  useDeepLinkStore.getState().setPendingRoute("/settings");
  // Do not exercise native push unregister in this synthetic fixture.
  h.service.cachedWallet = null;
  const remove = h.SecureStore.deleteItemAsync;
  h.SecureStore.deleteItemAsync = async (key) => { if (key === "primary") throw new Error("Injected deletion failure"); return remove(key); };
  const logout = h.auth.getState().logout();
  expect(useDeepLinkStore.getState().pendingRoute).toBeNull();
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: false, walletAddress: null, recoveryPhrase: null, user: null });
  await expect(logout).rejects.toBeInstanceOf(WalletCleanupError);
  expect(h.service.cachedMnemonic).toBeNull();
  expect(h.publicStorage.get("wallet_cleanup_pending_v1")).toBe(true);
  expect(h.auth.getState().walletError).toContain("cleanup is incomplete");
  h.completeBootstrap({});
  await flush();
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: false, user: null, userLevel: 0 });
  h.SecureStore.deleteItemAsync = remove;
  await h.auth.getState().initializeWallet();
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: false, walletError: null, isInitializing: false });
  expect(h.secure.size).toBe(0);
});

test("replacement double failure surfaces typed recovery and cannot keep a signed-in UI", async () => {
  const h = authHarness();
  await h.auth.getState().initializeWallet();
  const set = h.SecureStore.setItemAsync;
  let writes = 0;
  h.SecureStore.setItemAsync = async (key, value) => {
    if (key === "primary") {
      writes += 1;
      if (writes === 2) throw new Error("Rollback failed");
      await set(key, value);
      throw new Error("Promotion failed after write");
    }
    await set(key, value);
  };
  await expect(h.auth.getState().importWallet("mnemonic:new")).rejects.toBeInstanceOf(WalletRecoveryError);
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: false, walletAddress: null, user: null, recoveryPhrase: null });
  expect(h.auth.getState().walletError).toContain("Recovery material has been retained");
  expect(h.secure.get("backup")).toBe("mnemonic:old");
});

test("all pending startup checkpoints retain verified keys without normal bootstrap or implicit confirmation", async () => {
  for (const phase of [undefined, "wallet_generated", "registering", "submitted", "confirmed"]) {
    const h = authHarness();
    h.service.updateMetadata({ pending: true, hasUsername: phase === undefined || phase === "confirmed", signup: phase ? { phase, operationId: "fixture", username: "fixture" } : undefined });
    await h.auth.getState().initializeWallet();
    expect(h.auth.getState()).toMatchObject({ isInitializing: false, isLoggedIn: false, walletAddress: "old", recoveryPhrase: "mnemonic:old", hasUsername: phase === "confirmed" });
    expect(h.bootstrapCalls).toBe(0);
    expect(h.secure.get("primary")).toBe("mnemonic:old");
    expect(h.calls.filter(([operation]) => operation === "remove")).toHaveLength(0);
    if (phase === "confirmed") {
      await h.auth.getState().confirmWalletCreation();
      expect(h.auth.getState()).toMatchObject({ isLoggedIn: true, recoveryPhrase: null });
    } else {
      await expect(h.auth.getState().confirmWalletCreation()).rejects.toThrow();
      h.auth.setState({ hasUsername: true });
      await expect(h.auth.getState().confirmWalletCreation()).rejects.toThrow();
    }
  }
});

test("store import has a synchronous lock and failed replacement preserves previous signing session", async () => {
  const h = authHarness();
  await h.auth.getState().initializeWallet();
  const importing = h.auth.getState().importWallet("invalid fixture");
  await expect(h.auth.getState().importWallet("mnemonic:new")).rejects.toThrow("already running");
  await expect(importing).rejects.toThrow("Invalid mnemonic");
  expect(h.auth.getState()).toMatchObject({ walletAddress: "old", isLoggedIn: true, isCreatingWallet: false });
  expect(h.authSessionCoordinator.current().walletAddress).toBe("old");
  expect((await h.service.getWallet()).address).toBe("old");
  expect(h.secure.get("primary")).toBe("mnemonic:old");
});

test("confirmation rejects a stale current generation rather than adopting the address from state", async () => {
  const h = authHarness();
  h.service.updateMetadata({ pending: true, hasUsername: true, signup: { phase: "confirmed", operationId: "fixture", username: "fixture" } });
  await h.auth.getState().initializeWallet();
  h.authSessionCoordinator.begin("other");
  await expect(h.auth.getState().confirmWalletCreation()).rejects.toThrow("session changed");
  expect(h.service.getWalletMetadata().pending).toBe(true);
  expect(h.auth.getState().isLoggedIn).toBe(false);
});

test("production wallet creation publishes only pending identity and refuses duplicate generation or early confirmation", async () => {
  const h = authHarness();
  await expect(h.auth.getState().createNewWallet()).rejects.toThrow("local wallet restoration");
  await h.service.clearWallet();
  await h.auth.getState().initializeWallet();
  const create = h.auth.getState().createNewWallet();
  await expect(h.auth.getState().createNewWallet()).rejects.toThrow("already running");
  expect(await create).toBe("mnemonic:new");
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: false, hasUsername: false, hasOnboarded: false, recoveryPhrase: "mnemonic:new", walletAddress: "new" });
  expect(h.service.getWalletMetadata().signup.phase).toBe("wallet_generated");
  await expect(h.auth.getState().confirmWalletCreation()).rejects.toThrow();
  await expect(h.auth.getState().importWallet("mnemonic:replacement")).rejects.toThrow("pending signup");
  await expect(h.auth.getState().createNewWallet()).rejects.toThrow("existing wallet");
  expect(h.secure.get("primary")).toBe("mnemonic:new");
});

test("confirmation cannot complete after disclosure becomes inactive during secure verification", async () => {
  const h = authHarness();
  h.service.updateMetadata({ pending: true, hasUsername: true, signup: { phase: "confirmed", operationId: "fixture", username: "fixture" } });
  await h.auth.getState().initializeWallet();
  let active = true;
  let complete;
  h.service.getWallet = () => new Promise((resolve) => { complete = resolve; });
  const confirmation = h.auth.getState().confirmWalletCreation(() => active);
  active = false;
  complete({ address: "old" });
  await expect(confirmation).rejects.toThrow("session changed");
  expect(h.service.getWalletMetadata().pending).toBe(true);
  expect(h.auth.getState().isLoggedIn).toBe(false);
});

function authNavigationHarness(h, initialPath) {
  const calls = [];
  let pathname = initialPath;
  const tasks = [];
  const routeMap = loadInjectedModule("../../src/navigation/route-map.ts", {
    Platform: { OS: "android" }, Sentry: { addBreadcrumb() {} },
  }, "({ validatePendingRoute, routeRequiresAuth, isTabRoute, NOT_FOUND_ROUTE })");
  const bindings = {
    ...routeMap, isProtectedEntryReady, canEnterProtectedRoute,
    useAuthStore: Object.assign((select) => select(h.auth.getState()), { getState: h.auth.getState }),
    useDeepLinkStore: Object.assign((select) => select(useDeepLinkStore.getState()), { getState: useDeepLinkStore.getState }),
    authSessionCoordinator: h.authSessionCoordinator,
    AUTH_EXIT_ROUTE: "/",
    replaceBypass: (route) => calls.push(["replace", route]),
    pushBypass: (route) => calls.push(["push", route]),
    navigateBypass: (route) => calls.push(["navigate", route]),
    router: {},
  };
  const navigation = loadInjectedModule("../../src/navigation/auth-navigation.ts", bindings,
    "({ exitAuthModal, flushPendingRouteAfterAuth, isAuthRoute, isCompletedAuthExit })");
  const hooks = navigationHooksHarness();
  const Orchestrator = loadInjectedModule("../../src/navigation/auth-intent-orchestrator.tsx", {
    ...bindings, ...navigation, ...hooks,
    usePathname: () => pathname, useRootNavigationState: () => ({ key: "mounted" }),
    usePreferencesStore: Object.assign((select) => select({ hasSeenAdultPrompt: true, apiServer: "fixture" }), { getState: () => ({ apiServer: "fixture" }) }),
    hasCompletedLaunchThisRuntime: () => true,
    InteractionManager: { runAfterInteractions(fn) { const task = { fn, cancelled: false }; tasks.push(task); return { cancel: () => { task.cancelled = true; } }; } },
  }, "AuthIntentOrchestrator");
  return {
    ...navigation, calls,
    render: () => hooks.render(Orchestrator), route: (route) => { pathname = route; },
    settle: () => tasks.splice(0).forEach((task) => { if (!task.cancelled) task.fn(); }),
    unmount: hooks.unmount,
  };
}

test("production store import -> phrase callback -> modal exit -> layout replay composes with synthetic secure storage", async () => {
  const h = authHarness();
  await h.service.clearWallet();
  await h.auth.getState().initializeWallet();
  useDeepLinkStore.getState().setPendingRoute("/settings?section=privacy");
  const nav = authNavigationHarness(h, "/login");
  nav.render();
  const hooks = hookHarness();
  const importSecureWallet = h.service.importWallet.bind(h.service);
  h.service.importWallet = () => importSecureWallet("mnemonic:imported");
  const usePhraseImport = loadInjectedModule("../../src/pages/auth/use-phrase-import.ts", {
    ...hooks, useAuthStore: h.auth, ...nav,
    wordlist: ["synthetic"], validateMnemonic: () => true, normalizeRecoveryPhrase, PHRASE_WORD_COUNTS,
    Keyboard: { dismiss() {} }, triggerHaptic() {},
  }, "usePhraseImport");
  const render = () => hooks.render(() => usePhraseImport(() => true));
  render().handleWordsChange(Array(12).fill("synthetic"));
  const login = render().handleLogin();
  nav.render(); nav.settle();
  expect(nav.calls).toEqual([]);
  h.completeBootstrap({}); await login;
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: true, hasUsername: true, walletAddress: "imported" });
  expect(nav.calls).toEqual([["replace", "/"]]);
  nav.render(); nav.settle();
  expect(useDeepLinkStore.getState().pendingRoute).not.toBeNull();
  nav.route("/"); nav.render(); nav.settle(); nav.render(); nav.settle();
  expect(nav.calls).toEqual([["replace", "/"], ["push", "/settings?section=privacy"]]);
  expect(useDeepLinkStore.getState().pendingRoute).toBeNull();
  hooks.unmount(); nav.unmount();
});

test("production confirmed signup callback -> secure confirmation -> modal exit -> layout replay needs no fresh bootstrap", async () => {
  const h = authHarness();
  h.service.updateMetadata({ pending: true, hasUsername: true, signup: { phase: "confirmed", operationId: "fixture", username: "fixture" } });
  await h.auth.getState().initializeWallet();
  useDeepLinkStore.getState().setPendingRoute("/inbox?tab=replies");
  const nav = authNavigationHarness(h, "/recovery-phrase");
  nav.render(); nav.settle();
  expect(nav.calls).toEqual([]);
  const handleContinue = loadInjectedModule("../../src/pages/auth/recovery-phrase-page.tsx", {
    useCallback: (fn) => fn, hasSaved: true, locked: { current: false }, mounted: { current: true },
    protection: { isVisible: () => true }, authSessionCoordinator: h.authSessionCoordinator,
    confirmWalletCreation: h.auth.getState().confirmWalletCreation,
    setIsConfirming() {}, triggerHaptic() {}, setErrorMessage: (error) => { throw new Error(error); },
    usePreferencesStore: { getState: () => ({ apiServer: "fixture" }) },
    apiClient: { setBaseUrl() {} }, getApiBaseUrl: (server) => server,
    exitAuthModal: nav.exitAuthModal,
  }, "handleContinue", (source) => source.slice(source.indexOf("  const handleContinue ="), source.indexOf('  if (access === "redirect_home")')));
  await handleContinue();
  expect(h.auth.getState()).toMatchObject({ isLoggedIn: true, recoveryPhrase: null, hasUsername: true });
  expect(h.service.getWalletMetadata().pending).toBe(false);
  expect(h.bootstrapCalls).toBe(0);
  expect(nav.calls).toEqual([["replace", "/"]]);
  nav.route("/"); nav.render(); nav.settle(); nav.render(); nav.settle();
  expect(nav.calls).toEqual([["replace", "/"], ["navigate", "/inbox?tab=replies"]]);
  expect(useDeepLinkStore.getState().pendingRoute).toBeNull();
  nav.unmount();
});
