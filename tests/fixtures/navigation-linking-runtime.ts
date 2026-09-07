// @ts-nocheck -- Isolated Bun runtime: native mocks must not leak into other tests.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadInjectedModule } from "../../scripts/fixtures/wallet-service-harness.js";
import { navigationHooksHarness } from "../../scripts/fixtures/navigation-hooks-harness.js";
import { hookHarness, deferred } from "../../scripts/fixtures/auth-hooks-harness.js";
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { normalizeRecoveryPhrase, PHRASE_WORD_COUNTS } from "../../src/domain/auth/phrase-input";

const alerts = [];
const navigation = [];
const campaigns = [];
const timers = [];
const breadcrumbs = [];
const auth = { isLoggedIn: false, isInitializing: false, hasUsername: true, walletAddress: null, logout: async () => undefined };
const useAuthStore = { getState: () => auth };
const usePreferencesStore = { getState: () => ({ apiServer: "custom.mirage.test" }) };
const nativeRouter = Object.fromEntries(["push", "replace", "navigate"].map((method) => [
  method, (route) => navigation.push([method, route]),
]));
mock.module("react-native", () => ({
  Platform: { OS: "android" }, Alert: { alert: (...args) => alerts.push(args) },
}));
mock.module("@sentry/react-native", () => ({ addBreadcrumb: (entry) => breadcrumbs.push(entry), captureException() {} }));
mock.module("expo-router", () => ({ router: nativeRouter, useRouter: () => nativeRouter }));
mock.module("expo-linking", () => ({ openURL: async () => undefined }));
mock.module("expo-share-intent/build/ExpoShareIntentModule", () => ({ default: {} }));
mock.module("@/src/stores/auth-store", () => ({ useAuthStore }));
mock.module("@/src/stores", () => ({ useAuthStore, usePreferencesStore }));
mock.module("@/src/stores/deferred-campaign-store", () => ({
  useDeferredCampaignStore: { getState: () => ({ captureFirstTouch: (fields) => campaigns.push(fields) }) },
}));
mock.module("@/src/stores/mmkv-storage", () => ({ storage: {} }));
mock.module("@/src/utils/share-scheme", () => ({ setShareScheme() {} }));
mock.module("@/src/navigation/pending-launch-intents", () => ({ persistPendingShareIntent() {} }));
globalThis.setTimeout = (callback) => { timers.push(callback); return 1; };
globalThis.__DEV__ = true;

const { useDeepLinkStore } = await import("../../src/stores/deep-link-store");
const { resetNavigationGuard, replaceBypass, navigateBypass, router } = await import("../../src/navigation/guarded-router");
const { resolveMirageUrl, routeRequiresAuth, validatePendingRoute } = await import("../../src/navigation/route-map");
const { isProtectedEntryReady, canEnterProtectedRoute } = await import("../../src/navigation/auth-entry-policy");
const { authSessionCoordinator } = await import("../../src/services/auth-session-coordinator");
const { resolveInitialHomeAnchor, isStartupHomePath } = await import("../../src/navigation/startup-route-policy");
const { resolveAuthSignupScreenAccess } = await import("../../src/navigation/auth-flow-policy");
const { resolveAuthNavigationTarget, flushPendingRouteAfterAuth, exitAuthModal, isAuthRoute, isCompletedAuthExit } = await import("../../src/navigation/auth-navigation");
const { handleMirageLink, redirectSystemPath, flushPendingLaunchRoute } = await import("../../src/navigation/linking");

function reset(isLoggedIn = false) {
  auth.isLoggedIn = isLoggedIn;
  auth.isInitializing = false;
  auth.hasUsername = true;
  auth.walletAddress = isLoggedIn ? "wallet" : null;
  useDeepLinkStore.getState().setPendingRoute(null);
  navigation.length = alerts.length = campaigns.length = timers.length = breadcrumbs.length = 0;
  resetNavigationGuard("test");
}
function state(overrides = {}) {
  return { isInitializing: false, isLoggedIn: auth.isLoggedIn, hasSeenAdultPrompt: true, ...overrides };
}
function pending() { return useDeepLinkStore.getState().pendingRoute; }
function forms(path) { return [path, `https://mirage.talk${path}`, `mirage:/${path}`, `mirage://${path}`]; }
beforeEach(() => reset());

const developmentEnvelope = (url) => `exp+mirage://expo-development-client/?url=${encodeURIComponent(url)}`;

test("observed iOS Linking.createURL root and group roots reach Home without pending intent", async () => {
  for (const input of ["mirage:///", "mirage://", "mirage-dev:///", "/", "/index", "/(app)", "/(app)/(tabs)", "/(app)/(tabs)/index", "mirage:///(app)/(tabs)/index"]) {
    for (const initial of [true, false]) {
      reset();
      expect(await redirectSystemPath({ path: input, initial }), input).toBe("/");
      expect(pending()).toBeNull();
      expect(alerts).toEqual([]);
    }
  }
});

test("development transport roots are not app deep links", async () => {
  for (const input of [
    developmentEnvelope("http://192.168.31.11:8081"),
    developmentEnvelope("http://192.168.31.11:8081/"),
    developmentEnvelope("http://localhost:8081/--/"),
    "mirage://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081",
    "exp://192.168.31.11:8081/", "exp://192.168.31.11:8081/--/", "exps://localhost:8081/--/",
  ]) {
    for (const initial of [true, false]) {
      reset();
      expect(await redirectSystemPath({ path: input, initial }), input).toBe("/");
      expect(pending()).toBeNull();
      expect(campaigns).toEqual([]);
    }
  }
});

test("Expo path delimiter preserves real app targets and retired/unknown not-found", async () => {
  for (const path of ["/c/news?sort=new", "/p/abc?highlight=reply", "/agents", "/topics", "/t/news", "/unknown"]) {
    const target = resolveMirageUrl(path).route;
    for (const input of [`exp://localhost:8081/--${path}`, developmentEnvelope(`http://localhost:8081/--${path}`)]) {
      reset();
      expect(await redirectSystemPath({ path: input, initial: false })).toBe(target);
      expect(await redirectSystemPath({ path: input, initial: true })).toBe(target === "/_not-found" ? target : "/");
      expect(pending()).toBe(target === "/_not-found" ? null : target);
    }
  }
});

test("development normalization is narrow and disabled in production", async () => {
  for (const input of ["https://localhost:8081/", "exp+other://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081", developmentEnvelope("http://localhost:8081/agents"), developmentEnvelope("invalid"), "exp+mirage://expo-development-client/unknown?url=http%3A%2F%2Flocalhost%3A8081", "mirage:////", "mirage:////agents"]) {
    expect(await redirectSystemPath({ path: input, initial: true }), input).toBe("/_not-found");
  }
  globalThis.__DEV__ = false;
  try {
    expect(await redirectSystemPath({ path: developmentEnvelope("http://localhost:8081/"), initial: true })).toBe("/_not-found");
  } finally {
    globalThis.__DEV__ = true;
  }
});

test("Go home replaces with the existing public root tab", () => {
  const screen = readFileSync(new URL("../../src/pages/not-found-screen.tsx", import.meta.url), "utf8");
  expect(screen).toContain('router.replace("/")');
  expect(existsSync(new URL("../../app/(app)/(tabs)/index.tsx", import.meta.url))).toBe(true);
  expect(resolveAuthNavigationTarget("/")).toBe("/");
});

const publicRoutes = [
  ["/", "/"],
  ["/c/news", "/c/news"],
  ["/c/index?sort=new", "/c/index?sort=new"],
  ["/c/news/teams", "/c/news/teams"],
  ["/c/news/teams/1?lens=raw", "/c/news/teams/1?lens=raw"],
  ["/p/abc?highlight=reply", "/post/abc?highlight=reply"],
  ["/post/abc?highlight=reply", "/post/abc?highlight=reply"],
  ["/comment/abc?highlight=reply", "/post/abc?highlight=reply&depth=5"],
  ["/comment/abc?depth=2&highlight=reply", "/post/abc?depth=2&highlight=reply"],
  ["/communities?sort=new", "/communities?sort=new"],
];

describe("public link runtime composition", () => {
  for (const isLoggedIn of [false, true]) {
    for (const [path, target] of publicRoutes) {
      test(`${isLoggedIn ? "authenticated" : "guest"} ${path}: path/HTTPS/scheme, handler/warm/cold`, async () => {
        for (const input of forms(path)) {
          reset(isLoggedIn);
          expect(await handleMirageLink(input)).toBe(true);
          expect(navigation).toEqual([["push", target]]);
          expect(pending()).toBeNull();
          expect(alerts).toEqual([]);
          reset(isLoggedIn);
          expect(await redirectSystemPath({ path: input, initial: false })).toBe(target);
          expect(pending()).toBeNull();
          expect(timers).toEqual([]);
          expect(await redirectSystemPath({ path: input, initial: true })).toBe("/");
          expect(pending()).toBe(target === "/" ? null : target);
          if (target !== "/") {
            expect(flushPendingLaunchRoute(state({ isInitializing: true }))).toBe("waiting");
            expect(flushPendingLaunchRoute(state({ hasSeenAdultPrompt: false }))).toBe("dispatched");
            expect(navigation).toEqual([["push", target]]);
          }
          expect(pending()).toBeNull();
          expect(flushPendingLaunchRoute(state())).toBe("none");
          expect(alerts).toEqual([]);
        }
      });
    }
  }
  test("direct auth navigation uses the canonical public policy", () => {
    for (const [, target] of publicRoutes) {
      expect(resolveAuthNavigationTarget(target)).toBe(target);
      expect(pending()).toBeNull();
    }
    expect(resolveAuthNavigationTarget("/_not-found")).toBe("/_not-found");
    expect(pending()).toBeNull();
  });
});

describe("protected link runtime composition", () => {
  for (const target of ["/creator-earnings?from=link", "/curation-invitations", "/create?community=news"]) {
    for (const isLoggedIn of [false, true]) {
      test(`${target}, logged in: ${isLoggedIn}`, async () => {
        for (const input of forms(target)) {
          reset(isLoggedIn);
          expect(await handleMirageLink(input)).toBe(true);
          expect(navigation).toEqual(isLoggedIn ? [["push", target]] : []);
          expect(pending()).toBe(isLoggedIn ? null : target);
          expect(alerts.length).toBe(isLoggedIn ? 0 : 1);
          reset(isLoggedIn);
          expect(await redirectSystemPath({ path: input, initial: false })).toBe(isLoggedIn ? target : "/");
          expect(pending()).toBe(isLoggedIn ? null : target);
          if (!isLoggedIn) {
            expect(timers.length).toBe(1);
            timers[0]();
            expect(alerts[0][0]).toBe("Login Required");
            expect(flushPendingRouteAfterAuth()).toBe(false);
            auth.isLoggedIn = true;
            expect(flushPendingRouteAfterAuth()).toBe(true);
            expect(navigation).toEqual([[target.startsWith("/create?") ? "navigate" : "push", target]]);
            expect(pending()).toBeNull();
          }
          reset(isLoggedIn);
          expect(await redirectSystemPath({ path: input, initial: true })).toBe("/");
          expect(flushPendingLaunchRoute(state({ isInitializing: true }))).toBe("waiting");
          if (!isLoggedIn) {
            expect(flushPendingLaunchRoute(state())).toBe("auth_required");
            expect(pending()).toBe(target);
            auth.isLoggedIn = true;
          }
          expect(flushPendingLaunchRoute(state({ hasSeenAdultPrompt: false }))).toBe("waiting");
          expect(flushPendingLaunchRoute(state())).toBe("dispatched");
          expect(navigation).toEqual([[target.startsWith("/create?") ? "navigate" : "push", target]]);
          expect(pending()).toBeNull();
        }
      });
    }
  }
});

test("retired, unknown and malformed paths are immediate not-found in every form", async () => {
  for (const path of ["/agents", "/annotate", "/quests", "/referrals", "/invite-and-earn", "/t/news", "/topic/news", "/topics", "/_not-found", "/unknown", "/p//abc", "/post/abc/extra", "/c//news", "/c/%ZZ", "/c/all", "/c/news/other", "/c/news/teams/1/extra", "/post/%2F", "/c/news/teams/%2F", "/username/extra", "/recovery-phrase/extra", "/creator-earnings/extra", "/create/extra"]) {
    for (const input of forms(path)) {
      for (const isLoggedIn of [false, true]) {
        reset(isLoggedIn);
        expect(await handleMirageLink(input), input).toBe(true);
        expect(navigation, input).toEqual([["push", "/_not-found"]]);
        expect(await redirectSystemPath({ path: input, initial: false }), input).toBe("/_not-found");
        expect(await redirectSystemPath({ path: input, initial: true }), input).toBe("/_not-found");
        expect(pending()).toBeNull();
        expect(alerts).toEqual([]);
        expect(timers).toEqual([]);
      }
    }
  }
});

test("auth aliases share warm/cold dispatch and capture campaign before query removal", async () => {
  for (const path of ["/username", "/signup", "/create_account", "/login"]) {
    const target = path === "/login" ? path : "/username";
    for (const input of forms(`${path}?ref=alice&utm_source=launch&invite_code=retired`)) {
      for (const isLoggedIn of [false, true]) {
        reset(isLoggedIn);
        expect(await handleMirageLink(input)).toBe(true);
        expect(campaigns).toEqual([{ ref: "alice", utm_source: "launch" }]);
        expect(navigation).toEqual(isLoggedIn ? [] : [["push", target]]);
        expect(alerts.length).toBe(isLoggedIn ? 1 : 0);
        reset(isLoggedIn);
        expect(await redirectSystemPath({ path: input, initial: false })).toBe(isLoggedIn ? "/" : target);
        expect(pending()).toBeNull();
        expect(alerts.length).toBe(isLoggedIn ? 1 : 0);
        reset(isLoggedIn);
        expect(await redirectSystemPath({ path: input, initial: true })).toBe("/");
        expect(pending()).toBe(target);
        expect(campaigns).toEqual([{ ref: "alice", utm_source: "launch" }]);
        expect(flushPendingLaunchRoute(state())).toBe("dispatched");
        expect(pending()).toBeNull();
        expect(navigation).toEqual(isLoggedIn ? [] : [["push", target]]);
        expect(alerts.length).toBe(isLoggedIn ? 1 : 0);
      }
    }
  }
});

test("canonical create and post routes preserve alias parameters and auth classification", () => {
  for (const [canonical, alias] of [["/create", "/create_post"], ["/post/abc", "/p/abc"], ["/username", "/signup"], ["/blocked-list", "/blocks"], ["/user/alice", "/u/alice"]]) {
    for (const query of ["", "?highlight=reply&depth=3"]) {
      const expected = resolveMirageUrl(alias + query);
      for (const input of forms(canonical + query)) {
        expect(resolveMirageUrl(input)).toMatchObject({ route: expected.route, type: expected.type, requiresAuth: routeRequiresAuth(expected.route) });
      }
    }
  }
});

test("recovery links retain local onboarding access guards, never accept a linked seed", async () => {
  for (const input of forms("/recovery-phrase?username=alice&recoveryPhrase=secret&sessionStatus=pending_signup")) {
    for (const isLoggedIn of [false, true]) {
      reset(isLoggedIn);
      const target = "/recovery-phrase?username=alice";
      expect(await handleMirageLink(input)).toBe(true);
      expect(navigation).toEqual([["push", target]]);
      expect(await redirectSystemPath({ path: input, initial: false })).toBe(target);
      expect(await redirectSystemPath({ path: input, initial: true })).toBe("/");
      expect(pending()).toBe(target);
      expect(flushPendingLaunchRoute(state())).toBe("dispatched");
      expect(alerts).toEqual([]);
      expect(resolveAuthSignupScreenAccess({ screen: "recovery-phrase", sessionStatus: isLoggedIn ? "authenticated" : "guest", hasRecoveryPhrase: isLoggedIn, isCompletingSignup: false })).toBe(isLoggedIn ? "redirect_home" : "redirect_username");
    }
  }
  expect(resolveAuthSignupScreenAccess({ screen: "recovery-phrase", sessionStatus: "pending_signup", hasRecoveryPhrase: true, isCompletingSignup: false })).toBe("redirect_username");
  expect(resolveAuthSignupScreenAccess({ screen: "recovery-phrase", sessionStatus: "pending_signup", hasRecoveryPhrase: true, hasConfirmedUsername: true, isCompletingSignup: false })).toBe("show");
  const screen = readFileSync(new URL("../../src/pages/auth/recovery-phrase-page.tsx", import.meta.url), "utf8");
  expect(screen).toContain("resolveAuthSignupScreenAccess({");
  expect(screen).toContain("useAuthStore((s) => s.recoveryPhrase)");
  expect(screen).not.toContain("params.recoveryPhrase");
});

test("only root/group index representations are Home, not resource IDs", () => {
  for (const path of ["/", "/index", "/(tabs)", "/(tabs)/", "/(tabs)/index", "/(app)/(tabs)/index"]) {
    expect(isStartupHomePath(path)).toBe(true);
    expect(resolveInitialHomeAnchor(path).pendingRoute).toBeNull();
  }
  for (const path of ["", "/c/index", "/post/index", "/user/index", "/c/news/(tabs)"]) {
    expect(isStartupHomePath(path)).toBe(false);
  }
  expect(resolveInitialHomeAnchor("/c/index?sort=new")).toEqual({ route: "/", pendingRoute: "/c/index?sort=new" });
});

test("untrusted hosts are not handled; configured Mirage host remains supported", async () => {
  expect(await handleMirageLink("https://example.com/c/news?utm_source=no")).toBe(false);
  expect(campaigns).toEqual([]);
  expect(navigation).toEqual([]);
  expect(await handleMirageLink("https://custom.mirage.test/c/news")).toBe(true);
  expect(navigation).toEqual([["push", "/c/news"]]);
});

test("route wrappers and Stack/Tab declarations stay coherent", () => {
  const root = join(import.meta.dir, "../../app/(app)");
  const read = (path) => readFileSync(join(import.meta.dir, "../..", path), "utf8");
  const names = (text) => [...text.matchAll(/<(?:Stack|Tabs)\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
  const stackNames = names(read("src/navigation/app-stack-layout.tsx"));
  expect(new Set(stackNames).size).toBe(stackNames.length);
  for (const name of stackNames) {
    expect(existsSync(join(root, `${name}.tsx`)) || existsSync(join(root, name, "_layout.tsx")), name).toBe(true);
  }
  const stackFiles = [];
  function walk(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("(")) continue;
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), `${name}/`);
      else if (entry.name !== "_layout.tsx") stackFiles.push(name.replace(/\.tsx$/, ""));
    }
  }
  walk(root);
  expect(stackNames.filter((name) => !name.startsWith("(")).sort()).toEqual(stackFiles.sort());
  for (const [group, layout] of [["(auth)", "app/(app)/(auth)/_layout.tsx"], ["(tabs)", "src/navigation/tab-layout.tsx"]]) {
    const screens = readdirSync(join(root, group)).filter((name) => name !== "_layout.tsx").map((name) => name.replace(/\.tsx$/, "")).sort();
    expect(names(read(layout)).sort()).toEqual(screens);
  }
  expect(read("app/+native-intent.ts")).toContain("@/src/navigation/linking");
});

function layoutHarness(initialPath = "/") {
  let href = initialPath;
  let focused = true;
  let mounted = true;
  let adultReady = true;
  let isTransitioning = false;
  let apiServer = "fixture";
  let launchCompleted = true;
  const interactions = [];
  const entryHooks = navigationHooksHarness();
  const replayHooks = navigationHooksHarness();
  const launchHooks = navigationHooksHarness();
  const bindings = {
    usePathname: () => href.split("?")[0], useUnstableGlobalHref: () => href,
    useIsFocused: () => focused,
    useRootNavigationState: () => mounted ? { key: "mounted" } : undefined,
    useAuthStore: Object.assign((select) => select(auth), useAuthStore),
    useDeepLinkStore: Object.assign((select) => select(useDeepLinkStore.getState()), { getState: useDeepLinkStore.getState }),
    usePreferencesStore: Object.assign((select) => select({ hasSeenAdultPrompt: adultReady, apiServer }), { getState: () => ({ apiServer }) }),
    hasCompletedLaunchThisRuntime: () => launchCompleted,
    InteractionManager: { runAfterInteractions(fn) { const task = { fn, cancelled: false }; interactions.push(task); return { cancel: () => { task.cancelled = true; } }; } },
    isProtectedEntryReady, canEnterProtectedRoute, routeRequiresAuth, validatePendingRoute,
    replaceBypass, authSessionCoordinator, flushPendingRouteAfterAuth, isAuthRoute, isCompletedAuthExit,
  };
  const Entry = loadInjectedModule("../../src/navigation/protected-entry.tsx", { ...bindings, ...entryHooks }, "ProtectedEntry");
  const Replay = loadInjectedModule("../../src/navigation/auth-intent-orchestrator.tsx", { ...bindings, ...replayHooks }, "AuthIntentOrchestrator");
  const Launch = loadInjectedModule("../../src/navigation/launch-route-orchestrator.tsx", {
    ...bindings, ...launchHooks,
    useShareIntentContext: () => ({ hasShareIntent: false }),
    selectAuthSessionStatus: (state) => state.isLoggedIn ? "authenticated" : "guest",
    AUTH_RECOVERY_ROUTE: "/recovery-phrase", STARTUP_HOME_ROUTE: "/",
    isStartupHomePath, flushPendingLaunchRoute, navigateBypass,
    isInboxNotificationNavigationActive: () => false, isInboxNotificationNavigationPending: () => false,
    markShareIntentNavigationActive() {}, getPendingShareIntent: () => null,
    markLaunchCompletedThisRuntime: () => { launchCompleted = true; }, signalStartupHomeReady() {},
    Sentry: { addBreadcrumb: (entry) => breadcrumbs.push(entry) },
  }, "LaunchRouteOrchestrator");
  return {
    entry: (screenName = href.split("?")[0].slice(1) || "index") => entryHooks.render(() => Entry({ children: "screen-content", screenName })),
    replay: () => replayHooks.render(() => Replay({ isTransitioning })),
    launch: () => launchHooks.render(Launch),
    launchCompleted: (value) => { launchCompleted = value; },
    route: (value) => { href = value; },
    focused: (value) => { focused = value; },
    transitioning: (value) => { isTransitioning = value; },
    server: (value) => { apiServer = value; },
    mounted: (value) => { mounted = value; }, adult: (value) => { adultReady = value; },
    settle: () => interactions.splice(0).forEach((task) => { if (!task.cancelled) task.fn(); }),
    unmount: () => { entryHooks.unmount(); replayHooks.unmount(); launchHooks.unmount(); },
  };
}

test("every protected wrapper blocks entry before mount; public guest browsing remains mounted", () => {
  const protectedPaths = ["/following", "/inbox", "/profile", "/create", "/settings", "/search", "/user/alice", "/user-following/alice", "/blocked-list", "/curation-invitations", "/creator-earnings", "/subscription", "/history", "/saved-posts", "/delete-account", "/change-username", "/view-recovery-phrase", "/video-editor", "/edit-post", "/comment-compose"];
  for (const path of protectedPaths) {
    reset();
    const target = `${path}?from=internal&value=a%2Bb&value=two`;
    router.push(target);
    const h = layoutHarness(target);
    expect(h.entry()).toBeNull();
    expect(pending()).toBe(target);
    expect(navigation.at(-1)).toEqual(["replace", "/login"]);
    h.unmount();
  }
  for (const path of [...publicRoutes.map(([, path]) => path), "/post-media/abc", "/login", "/username", "/recovery-phrase"]) {
    reset();
    const h = layoutHarness(path);
    expect(h.entry()).toBe("screen-content");
    expect(navigation).toEqual([]);
    h.unmount();
  }
});

test("hydration blocks private rendering without redirects and cached username readiness needs no bootstrap", () => {
  reset(true);
  auth.isInitializing = true;
  auth.isBootstrapping = true;
  const h = layoutHarness("/settings");
  expect(h.entry()).toBeNull();
  expect(navigation).toEqual([]);
  auth.isInitializing = false;
  for (let i = 0; i < 10; i++) expect(h.entry()).toBe("screen-content");
  expect(navigation).toEqual([]);
  auth.hasUsername = false;
  expect(h.entry()).toBeNull();
  expect(navigation.at(-1)).toEqual(["replace", "/change-username"]);
  h.route("/change-username");
  expect(h.entry()).toBe("screen-content");
  h.unmount();
});

test("actual phrase import callback exits modal before layout replays exact warm intent once", async () => {
  const target = "/create?community=news&text=a%2Bb";
  await handleMirageLink(`mirage://${target}`);
  alerts[0][2][1].onPress();
  const layout = layoutHarness("/login");
  layout.replay();
  const hooks = hookHarness();
  const waiting = deferred();
  auth.importWallet = async () => {
    await waiting.promise;
    authSessionCoordinator.begin("imported");
    Object.assign(auth, { isLoggedIn: true, hasUsername: true, walletAddress: "imported" });
  };
  const usePhraseImport = loadInjectedModule("../../src/pages/auth/use-phrase-import.ts", {
    ...hooks, Keyboard: { dismiss() {} }, wordlist, validateMnemonic, normalizeRecoveryPhrase, PHRASE_WORD_COUNTS,
    useAuthStore, exitAuthModal, triggerHaptic() {},
  }, "usePhraseImport");
  const render = () => hooks.render(() => usePhraseImport(() => true));
  render().handleWordsChange(entropyToMnemonic(new Uint8Array(16), wordlist).split(" "));
  const login = render().handleLogin();
  layout.replay(); layout.settle();
  expect(pending()).toBe(target);
  waiting.resolve(); await login;
  expect(navigation.at(-1)).toEqual(["replace", "/"]);
  layout.replay(); layout.settle();
  expect(pending()).toBe(target);
  layout.route("/"); layout.replay();
  expect(pending()).toBe(target);
  layout.settle();
  expect(navigation.slice(-2)).toEqual([["replace", "/"], ["navigate", target]]);
  expect(pending()).toBeNull();
  layout.replay(); layout.settle();
  expect(navigation.filter(([, route]) => route === target)).toHaveLength(1);
  hooks.unmount(); layout.unmount();
});

test("pending signup never replays; confirmed callback exit is held for navigation/adult/interaction readiness", async () => {
  await redirectSystemPath({ path: "mirage:///settings?section=privacy", initial: true });
  auth.hasUsername = true;
  auth.recoveryPhrase = "synthetic-pending";
  const h = layoutHarness("/recovery-phrase");
  h.replay(); h.settle();
  expect(pending()).toBe("/settings?section=privacy");
  authSessionCoordinator.begin("confirmed");
  Object.assign(auth, { isLoggedIn: true, walletAddress: "confirmed", recoveryPhrase: null });
  exitAuthModal();
  h.route("/"); h.mounted(false); h.replay(); h.settle();
  expect(pending()).not.toBeNull();
  h.mounted(true); h.adult(false); h.replay(); h.settle();
  expect(pending()).not.toBeNull();
  h.adult(true); h.replay(); h.settle();
  expect(navigation.slice(-2)).toEqual([["replace", "/"], ["push", "/settings?section=privacy"]]);
  h.unmount();
});

test("cancel and delayed alerts cannot clear or open a newer intent", async () => {
  await handleMirageLink("/settings");
  const oldAlert = alerts[0];
  await handleMirageLink("/inbox?tab=replies");
  oldAlert[2][0].onPress(); oldAlert[2][1].onPress();
  expect(pending()).toBe("/inbox?tab=replies");
  expect(navigation).toEqual([]);
  alerts[1][2][0].onPress();
  expect(pending()).toBeNull();
  await redirectSystemPath({ path: "/settings", initial: false });
  await handleMirageLink("/create");
  const count = alerts.length;
  timers[0]();
  expect(alerts).toHaveLength(count);
});

test("modal cancellation removes stale intent; failed login keeps it for retry; ordinary login goes Home", () => {
  useDeepLinkStore.getState().setPendingRoute("/settings");
  const h = layoutHarness("/login");
  h.replay(); h.settle();
  // Failed import leaves readiness false and the modal open.
  h.replay(); h.settle();
  expect(pending()).toBe("/settings");
  h.route("/"); h.replay(); h.settle();
  expect(pending()).toBeNull();
  h.route("/login"); h.replay();
  Object.assign(auth, { isLoggedIn: true, walletAddress: "wallet" });
  exitAuthModal(); h.route("/"); h.replay(); h.settle();
  expect(navigation).toEqual([["replace", "/"]]);
  h.unmount();
});

test("queued replay is fenced by session changes, replacement intents, and layout unmount", () => {
  reset(true);
  const h = layoutHarness("/");
  useDeepLinkStore.getState().setPendingRoute("/settings");
  h.replay(); authSessionCoordinator.begin("other"); h.settle();
  expect(navigation).toEqual([]);
  useDeepLinkStore.getState().setPendingRoute("/inbox");
  h.replay(); useDeepLinkStore.getState().setPendingRoute("/create"); h.settle();
  expect(navigation).toEqual([]);
  h.replay(); h.unmount(); h.settle();
  expect(navigation).toEqual([]);
});

test("replay validates fixed internal targets and rejects malicious/retired/external destinations", () => {
  reset(true);
  for (const target of ["https://evil.test/settings", "//evil.test/settings", "/settings/extra", "/agents", "/view-recovery-phrase/extra", "/post/%2f%2fevil.test", "/settings\\evil"]) {
    useDeepLinkStore.getState().setPendingRoute(target);
    expect(flushPendingRouteAfterAuth(), target).toBe(false);
    expect(pending()).toBeNull();
  }
  expect(navigation).toEqual([]);
  for (const route of ["/view-recovery-phrase", "/comment-compose", "/edit-post", "/video-editor"]) {
    expect(validatePendingRoute(route)).toBe(route);
    expect(resolveMirageUrl(`https://mirage.talk${route}`).type).toBe("notFound");
  }
  expect(resolveMirageUrl("ftp://mirage.talk/settings")).toBeNull();
  expect(resolveMirageUrl("https://evil@mirage.talk/settings")).toBeNull();
  expect(routeRequiresAuth("/(app)/(tabs)/index")).toBe(false);
  expect(routeRequiresAuth("/(app)/(tabs)")).toBe(false);
  expect(resolveAuthNavigationTarget("/settings?returnTo=https%3A%2F%2Fevil.test")).toBe("/settings?returnTo=https%3A%2F%2Fevil.test");
});

test("inactive protected screens remain concealed behind public login and public tab wrappers", () => {
  const h = layoutHarness("/login");
  h.focused(false);
  for (const screen of ["settings", "view-recovery-phrase", "create", "inbox"]) {
    expect(h.entry(screen)).toBeNull();
  }
  expect(h.entry("(auth)")).toBe("screen-content");
  expect(h.entry("(tabs)")).toBe("screen-content");
  expect(navigation).toEqual([]);
  expect(pending()).toBeNull();
  h.unmount();
});

test("native transition start cancels queued replay until transition end and interactions settle", () => {
  reset(true);
  useDeepLinkStore.getState().setPendingRoute("/settings");
  const h = layoutHarness("/");
  h.replay(); h.transitioning(true); h.replay(); h.settle();
  expect(navigation).toEqual([]);
  expect(pending()).toBe("/settings");
  h.transitioning(false); h.replay(); h.settle();
  expect(navigation).toEqual([["push", "/settings"]]);
  h.unmount();
});

test("a wallet switch clears the older intent before a ready replacement session can replay", () => {
  reset(true);
  useDeepLinkStore.getState().setPendingRoute("/settings");
  const h = layoutHarness("/");
  h.replay();
  auth.walletAddress = "replacement";
  authSessionCoordinator.begin("replacement");
  h.replay(); h.settle(); h.replay(); h.settle();
  expect(pending()).toBeNull();
  expect(navigation).toEqual([]);
  h.unmount();
});

test("stale logout-confirmation alerts cannot log out a replacement identity", async () => {
  reset(true);
  let logouts = 0;
  auth.logout = async () => { logouts++; };
  await handleMirageLink("/login");
  authSessionCoordinator.begin("replacement");
  await alerts[0][2][1].onPress();
  expect(logouts).toBe(0);
  expect(navigation).toEqual([]);
});

test("server changes invalidate pending login destinations and queued callbacks", () => {
  for (const rerender of [false, true]) {
    reset(true);
    useDeepLinkStore.getState().setPendingRoute("/edit-post?id=server-a-post");
    const h = layoutHarness("/");
    h.replay(); h.server("server-b");
    if (rerender) h.replay();
    h.settle();
    expect(navigation).toEqual([]);
    expect(pending()).toBeNull();
    h.unmount();
  }
});

test("guest follows intent resolves only its fixed wallet placeholder after login, preserving query values", async () => {
  await handleMirageLink("/follows");
  expect(pending()).toBe("/user-following/__SELF__");
  auth.isLoggedIn = true;
  auth.walletAddress = "wallet";
  expect(flushPendingRouteAfterAuth()).toBe(true);
  expect(navigation.at(-1)).toEqual(["push", "/user-following/wallet"]);
  useDeepLinkStore.getState().setPendingRoute("/settings?value=__SELF__");
  expect(flushPendingRouteAfterAuth()).toBe(true);
  expect(navigation.at(-1)).toEqual(["push", "/settings?value=__SELF__"]);
});

test("path fallback diagnostics never include untrusted recovery-query contents", () => {
  expect(resolveMirageUrl("/recovery-phrase?recoveryPhrase=synthetic-private-input").route).toBe("/recovery-phrase");
  expect(breadcrumbs.some((entry) => entry.category === "deep-link")).toBe(true);
  expect(JSON.stringify(breadcrumbs)).not.toContain("synthetic-private-input");
});

test("cold restored protected entry composes Home anchoring, entry gate, login exit and replay without cancelling itself", () => {
  const target = "/settings?section=privacy&value=a%2Bb";
  const h = layoutHarness(target);
  h.launchCompleted(false);
  auth.isInitializing = true;
  h.launch(); h.replay();
  expect(h.entry()).toBeNull();
  expect(navigation).toEqual([]);
  auth.isInitializing = false;
  h.launch(); h.replay();
  expect(h.entry()).toBeNull();
  expect(navigation).toEqual([["replace", "/"]]);
  expect(pending()).toBe(target);
  h.route("/"); h.launch(); h.replay(); h.entry();
  expect(alerts).toHaveLength(1);
  expect(pending()).toBe(target);
  alerts[0][2][1].onPress();
  h.route("/login"); h.replay();
  Object.assign(auth, { isLoggedIn: true, walletAddress: "restored" });
  exitAuthModal();
  h.route("/"); h.launch(); h.replay(); h.settle();
  expect(navigation.slice(-2)).toEqual([["replace", "/"], ["push", target]]);
  expect(pending()).toBeNull();
  h.unmount();
});
