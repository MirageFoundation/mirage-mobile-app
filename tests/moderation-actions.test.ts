// @ts-nocheck -- Native-free execution harness; Bun supplies test types.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { eligibleModerationTeam, moderationTagLabel } from "../src/domain/communities/moderation-action";
import { groupEligibleModerationPosts, chunkModerationPostIds } from "../src/domain/communities";
import { fullscreenMediaColors } from "../src/components/molecules/post-actions-appearance";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const createElement = (type, props, ...children) => ({ type, props: { ...props, children }, children });
const nodes = (node) => !node || typeof node !== "object" ? [] : [node, ...(node.children ?? []).flat(Infinity).flatMap(nodes)];
const text = (node) => (node?.children ?? []).flat(Infinity).map((child) => typeof child === "object" ? text(child) : child ?? "").join("");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(path, modules) {
  const exports = {};
  new Function("require", "exports", "React", compile(read(path)))((name) => {
    if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
    return modules[name];
  }, exports, { createElement });
  return exports;
}
function hooks() {
  let cursor = 0;
  const values = [];
  const effects = [];
  const api = {
    memo: (fn) => fn, useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useRef: (initial) => { const index = cursor++; return values[index] ??= { current: initial }; },
    useState: (initial) => { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (next) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useEffect: (fn) => { const cleanup = fn(); if (cleanup) effects.push(cleanup); },
    createContext: () => ({ Provider: "Provider" }), useContext: () => api.context,
  };
  return { api, render: (fn) => { cursor = 0; return fn(); }, unmount: () => effects.forEach((fn) => fn()) };
}
const id = "a".repeat(64), rootId = "b".repeat(64);
const memberships = [{ community: "art", team_id: 7, name: "Art keepers" }];
const target = { postId: id, authorId: "other", community: "art", lens: { effective_team_id: 7 }, rootHash: rootId };
const theme = { colors: { text: { default: "#111" }, background: { default: "#fff" }, border: { default: "#ccc", subtle: "#ddd" }, error: { 500: "red" }, contrast: { base: "black" } }, radius: { full: 99, lg: 12 }, spacing: { xs: 4, md: 16 } };
const native = { View: "View", Text: "Text", Modal: "Modal", ScrollView: "ScrollView", FlatList: "FlatList", Pressable: "Pressable", Animated: { View: "Animated.View", Value: class {} } };
const ui = { Text: "Text" };
const styles = { useUnistyles: () => ({ theme }), StyleSheet: { create: (fn) => fn(theme) } };

function controllerHarness() {
  const h = hooks(), calls = [], toasts = [];
  const identity = { walletAddress: "viewer", apiServer: "server" };
  let write = async () => ({ settlement: { status: "settled" } });
  const mutation = (operation) => () => ({ mutateAsync: (input) => { calls.push({ operation, input }); return write(); } });
  const { usePostModeration } = load("src/pages/curation/use-post-moderation.ts", {
    react: h.api,
    "@/src/api/read": { useCuratorCommunities: () => ({ data: { memberships } }) },
    "@/src/api/write": { useSetCurationPostHidden: mutation("post"), useSetCurationUserHidden: mutation("author"), useSetCurationThreadLocked: mutation("lock"), useSetCurationPostTag: mutation("tag") },
    "@/src/domain/communities/moderation-action": { eligibleModerationTeam },
    "@/src/stores": { useAuthStore: (select) => select(identity), usePreferencesStore: (select) => select(identity) },
    "@/src/providers/toast-provider": { useToast: () => ({ success: (message) => toasts.push(message) }) },
  });
  const render = () => h.render(() => usePostModeration());
  render().open(target);
  return { render, calls, toasts, identity, h, setWrite: (fn) => { write = fn; } };
}

describe("team moderation capability and settlement", () => {
  test("accepted served membership only; guest, own, raw and different-team denied", () => {
    expect(eligibleModerationTeam(target, "VIEWER", memberships)?.name).toBe("Art keepers");
    for (const [post, viewer, teams] of [[target, null, memberships], [{ ...target, authorId: "VIEWER" }, "viewer", memberships], [{ ...target, lens: { effective_team_id: null } }, "viewer", memberships], [{ ...target, lens: { effective_team_id: 8 } }, "viewer", memberships], [target, "viewer", []]]) {
      expect(eligibleModerationTeam(post, viewer, teams)).toBeUndefined();
    }
  });
  test("exact selected team/targets; lock uses actual root and tags preserve null vs empty", async () => {
    const h = controllerHarness();
    await h.render().actions.hidePost(true);
    await h.render().actions.hideAuthor(false);
    await h.render().actions.lockThread(true);
    await h.render().actions.setPostTag("", false);
    await h.render().actions.clearPostTag();
    expect(h.calls).toEqual([
      { operation: "post", input: { community: "art", teamId: 7, target: id, hidden: true } },
      { operation: "author", input: { community: "art", teamId: 7, target: "other", hidden: false } },
      { operation: "lock", input: { community: "art", teamId: 7, rootHash: rootId, locked: true } },
      { operation: "tag", input: { community: "art", teamId: 7, target: id, tag: "", clear: false } },
      { operation: "tag", input: { community: "art", teamId: 7, target: id, tag: "", clear: true } },
    ]);
    expect(h.toasts).toHaveLength(5);
  });
  test("same-frame duplicates and syncing resubmission blocked; check-index can settle", async () => {
    const h = controllerHarness();
    let deliver;
    h.setWrite(() => new Promise((resolve) => { deliver = resolve; }));
    const action = h.render().actions.hidePost;
    const pending = action(true);
    await action(true);
    expect(h.render().state.pending).toBe(true);
    expect(h.calls).toHaveLength(1);
    deliver({ settlement: { status: "timeout" } });
    await pending;
    expect(h.render().state.syncing).toBe(true);
    await h.render().actions.hidePost(true);
    expect(h.calls).toHaveLength(1);
    expect(h.toasts).toHaveLength(0);
    h.render().confirmIndexed({ post_hidden: false });
    expect(h.render().state.syncing).toBe(true);
    h.render().confirmIndexed({ post_hidden: true });
    expect(h.render().state.syncing).toBeUndefined();
    expect(h.toasts).toEqual(["Team moderation synced"]);
  });
  test("backend rejection is visible without fake success and permits retry", async () => {
    const h = controllerHarness();
    h.setWrite(async () => { throw new Error("cannot ban a curator's post in this community"); });
    await h.render().actions.hidePost(true);
    expect(h.render().state.error).toContain("cannot ban a curator");
    expect(h.toasts).toHaveLength(0);
    h.setWrite(async () => ({ settlement: { status: "settled" } }));
    await h.render().actions.hidePost(true);
    expect(h.calls).toHaveLength(2);
  });
  test("old viewer/server callbacks cannot write or announce success after a scope change", async () => {
    for (const field of ["walletAddress", "apiServer"]) {
      const h = controllerHarness();
      const stale = h.render().actions.hidePost;
      h.identity[field] = "changed";
      expect(h.render().selected).toBeNull();
      await stale(true);
      expect(h.calls).toHaveLength(0);
    }
    const h = controllerHarness();
    let resolve;
    h.setWrite(() => new Promise((done) => { resolve = done; }));
    const pending = h.render().actions.hidePost(true);
    h.h.unmount();
    resolve({ settlement: { status: "settled" } });
    await pending;
    expect(h.toasts).toHaveLength(0);
  });
});

test("real moderation sheet: named team, unknown rows, pending/sync disable, distinct tag controls", () => {
  const { PostModerationMenu } = load("src/pages/curation/post-moderation-sheet.tsx", {
    "react-native": native, "react-native-unistyles": styles, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ bottom: 34 }) },
    "@/src/components/ui/primitives": ui, "@/src/domain/communities": { ALLOWED_CURATION_TAGS: ["", "adult"] },
    "@/src/domain/communities/moderation-action": { moderationTagLabel }, "@/src/components/molecules/post-actions-appearance": { fullscreenMediaColors },
  });
  const calls = [];
  const props = { visible: true, teamName: "Art keepers", community: "art", canLock: true, onSetPostTag: (...args) => calls.push(args), onClearPostTag: () => calls.push("clear") };
  const unknown = nodes(PostModerationMenu(props));
  expect(text(unknown[0])).toContain("Moderate for Art keepers");
  expect(text(unknown[0])).toContain("[art]");
  expect(unknown.some((node) => node.props.accessibilityLabel === "Hide post for team")).toBe(false);
  expect(unknown.some((node) => node.props.accessibilityLabel === "Retry moderation state")).toBe(true);
  for (const flag of ["pending", "syncing", "readError"]) {
    const tree = nodes(PostModerationMenu({ ...props, [flag]: true, overlay: { post_hidden: false, user_hidden: false, thread_locked: false, post_tag: null } }));
    expect(tree.find((node) => node.props.accessibilityLabel === "Hide post for team").props.disabled).toBe(true);
  }
  const tree = nodes(PostModerationMenu({ ...props, overlay: { post_hidden: true, user_hidden: false, thread_locked: true, post_tag: "" } }));
  expect(text(tree[0])).toContain("Explicit empty tag");
  tree.find((node) => node.props.accessibilityLabel === "Set explicit empty tag").props.onPress();
  tree.find((node) => node.props.accessibilityLabel === "Clear team tag override").props.onPress();
  expect(calls).toEqual([["", false], "clear"]);
});

test("personal hide/unhide and toast undo touch only the exact local ID, never team writes", () => {
  const h = hooks();
  let viewer = "viewer";
  const hiddenPostIds = new Set(["keep"]), toasts = [];
  const store = { hiddenPostIds, hidePost: (id) => hiddenPostIds.add(id), unhidePost: (id) => hiddenPostIds.delete(id) };
  const useAuthStore = Object.assign((select) => select({ isLoggedIn: true }), { getState: () => ({ walletAddress: viewer }) });
  const useContentModerationStore = Object.assign((select) => select(store), { getState: () => store });
  const { PostActions } = load("src/components/molecules/post-actions.tsx", {
    react: h.api, "react-native": native, "react-native-unistyles": styles,
    "@/assets/figma-icons": {}, "@/src/components/ui/primitives": ui, "@/src/components/utils/haptics": { triggerHaptic() {} },
    "@/src/stores": { useAuthStore, useContentModerationStore, useUIStore: (select) => select({}) },
    "@/src/features/moderation/moderation-provider": { ModerationButton: "ModerationButton" },
    "@/src/providers/toast-provider": { useToast: () => ({ show: (_, toast) => toasts.push(toast), success() {} }) },
    "@expo/vector-icons": { Ionicons: "Ionicons" }, "./post-actions-appearance": { fullscreenMediaColors },
    "react-native-popup-menu": { Menu: "Menu", MenuOption: "MenuOption", MenuOptions: "MenuOptions", MenuTrigger: "MenuTrigger" },
  });
  const render = () => nodes(h.render(() => PostActions({ likes: 0, dislikes: 0, comments: 0, postId: id, moderationTarget: target })));
  const select = (label) => render().find((node) => node.type === "MenuOption" && text(node) === label).props.onSelect();
  expect(render().find((node) => node.type === "ModerationButton").props.target).toEqual(target);
  select("Hide for me");
  expect([...hiddenPostIds]).toEqual(["keep", id]);
  toasts[0].action();
  expect([...hiddenPostIds]).toEqual(["keep"]);
  select("Hide for me");
  select("Unhide for me");
  expect([...hiddenPostIds]).toEqual(["keep"]);
  select("Hide for me");
  viewer = "other-wallet";
  toasts.at(-1).action();
  expect(hiddenPostIds.has(id)).toBe(true);
});

test("real batch query hook groups served community/team/viewer in at most 50 IDs with no leaf fallbacks", async () => {
  const h = hooks(), requests = [];
  let queryOptions;
  const { useBatchTeamModeration } = load("src/api/read/hooks/use-curation.ts", {
    react: h.api, "@tanstack/react-query": { useQueries: ({ queries }) => { queryOptions = queries; return queries.map(() => ({ data: { items: [] } })); } },
    "@/src/stores": { useAuthStore: (select) => select({ walletAddress: "VIEWER" }) },
    "@/src/domain/communities": { groupEligibleModerationPosts, chunkModerationPostIds },
    "../query-keys": { queryKeys: { communityTeamModeration: (...args) => args } },
    "../endpoints/curation": { getCommunityTeamModeration: (input) => { requests.push(input); return { items: [] }; } },
    "../signed-curator-read": { shouldRetryCuratorRead() {} },
  });
  const posts = Array.from({ length: 51 }, (_, n) => ({ ...target, post_id: n.toString(16).padStart(64, "0") }));
  const batch = h.render(() => useBatchTeamModeration(posts, { memberships }));
  await Promise.all(queryOptions.map((query) => query.queryFn({})));
  expect(requests.map((request) => request.postIds.length)).toEqual([50, 1]);
  expect(requests.every((request) => request.viewer === "viewer" && request.slug === "art" && request.teamId === 7)).toBe(true);
  expect(batch.itemsByPostId.get(posts[0].post_id)).toBeUndefined();
});

function renderedActionTarget(path) {
  const source = read(path);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let action;
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "PostActions") action = node;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const props = { id, author: { id: "other", username: "alice" }, community: "art", lens: target.lens };
  const scope = { PostActions: "PostActions", post: props, displayPost: props, author: props.author, community: "art", id, data: undefined, currentUser: {}, styles: {}, policy: { canReply: true }, getShareBaseUrl() {}, shareServer: "server", shareUrl: "url", title: "title" };
  for (const name of ["likes", "dislikes", "comments", "hasLiked", "hasDisliked", "disablePostInteractions", "disableInteractions", "onLikePress", "onDislikePress", "onCommentPress", "onSharePress", "isOwnPost", "onBlockUser", "onBlockPost", "onBlockCommunity", "onReport", "onHidePost", "hideCommentAction", "showComments", "close"]) scope[name] = undefined;
  return new Function("React", ...Object.keys(scope), compile(`const render = () => (${action.getText(ast)});`) + "; return render();")({ createElement }, ...Object.values(scope)).props.moderationTarget;
}

test("card, compact (including community), detail card and fullscreen bridge to a separate named shield/sheet", () => {
  const c = controllerHarness();
  c.render().close();
  const h = hooks();
  const { ModerationProvider, ModerationButton } = load("src/features/moderation/moderation-provider.tsx", {
    react: h.api, "react-native": native, "@expo/vector-icons": { Ionicons: "Ionicons" },
    "expo-router/react-navigation": { useIsFocused: () => true },
    "@/src/api/read/hooks/use-curation": { useBatchTeamModeration: () => ({ queries: [], itemsByPostId: new Map() }) },
    "@/src/pages/curation/use-post-moderation": { usePostModeration: c.render },
    "@/src/pages/curation/post-moderation-sheet": { PostModerationMenu: "Sheet" },
  });
  const provider = (root) => h.render(() => ModerationProvider({ children: "ordinary actions", root }));
  for (const [path, root] of [["src/components/molecules/post-card.tsx", undefined], ["src/components/molecules/post-card-compact.tsx", undefined], ["src/components/molecules/post-card.tsx", target], ["src/pages/post/post-media-page.tsx", undefined]]) {
    c.render().close();
    const actionTarget = renderedActionTarget(path);
    const before = provider(root);
    expect(nodes(before).find((node) => node.type === "Sheet").props.visible).toBe(false);
    h.api.context = before.props.value;
    const button = ModerationButton({ target: actionTarget });
    expect(button.props.accessibilityLabel).toBe("Moderate for Art keepers");
    let stopped = false;
    button.props.onPress({ stopPropagation: () => { stopped = true; } });
    expect(stopped).toBe(true);
    const sheet = nodes(provider(root)).find((node) => node.type === "Sheet");
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.teamName).toBe("Art keepers");
    expect(sheet.props.community).toBe("art");
    expect(c.calls).toHaveLength(0);
  }
});

test("reachable local-hidden recovery row restores exact ID without metadata or network", () => {
  const h = hooks(), hiddenPostIds = new Set([id, rootId]), calls = [];
  const store = { hiddenPostIds, unhidePost: (id) => { calls.push(id); hiddenPostIds.delete(id); } };
  const useAuthStore = Object.assign((select) => select({ walletAddress: "viewer" }), { getState: () => ({ walletAddress: "viewer" }) });
  const { LocalHiddenPosts } = load("src/pages/settings/local-hidden-posts.tsx", {
    react: h.api, "react-native": native, "react-native-unistyles": styles, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    "@/src/components/ui/primitives": ui,
    "@/src/stores": { useAuthStore, useContentModerationStore: Object.assign((select) => select(store), { getState: () => store }), useSavedPostsStore: (select) => select({ savedPosts: [] }) },
    "@/src/stores/history-store": { useHistoryStore: (select) => select({ entries: [] }) },
    "@/src/providers/toast-provider": { useToast: () => ({ success() {} }) },
  });
  const render = () => nodes(h.render(LocalHiddenPosts));
  render().find((node) => node.type === "Pressable").props.onPress();
  expect(render().find((node) => node.type === "Modal").props.visible).toBe(true);
  const list = render().find((node) => node.type === "FlatList");
  const row = nodes(list.props.renderItem({ item: id }));
  expect(text(row[0])).toContain("Post details unavailable");
  row.find((node) => node.type === "Pressable").props.onPress();
  expect(calls).toEqual([id]);
  expect([...hiddenPostIds]).toEqual([rootId]);
});

test("central curation mutation refuses stale signing identity and suppresses cross-scope cache effects", async () => {
  let current = { walletAddress: "viewer", apiServer: "server" }, writes = 0, cacheEffects = 0;
  const usePreferencesStore = Object.assign((select) => select(current), { getState: () => current });
  const { useSetCurationPostHidden } = load("src/api/write/hooks/use-curation.ts", {
    "@tanstack/react-query": { useMutation: (options) => options, useQueryClient: () => ({}) },
    "@/src/hooks/use-wallet": { useWallet: () => ({ address: "viewer", getWallet: async () => ({ address: "viewer" }) }) },
    "@/src/stores/auth-store": { useAuthStore: { getState: () => current } },
    "@/src/stores/preferences-store": { usePreferencesStore },
    "../mutation-keys": { mutationKeys: { curation: { setPostHidden: () => ["test"] } } },
    "../utils/curation-settled-effects": { applyCurationSettledEffects: () => cacheEffects++ },
    "../endpoints/curation": { setCurationPostHiddenSettled: async () => { writes++; return { settlement: { status: "settled" } }; } },
  });
  const mutation = useSetCurationPostHidden(), scope = mutation.onMutate();
  const result = await mutation.mutationFn({});
  mutation.onSuccess(result, {}, scope);
  expect(cacheEffects).toBe(1);
  for (const field of ["walletAddress", "apiServer"]) {
    current = { walletAddress: "viewer", apiServer: "server", [field]: "changed" };
    mutation.onSuccess(result, {}, scope);
    expect(cacheEffects).toBe(1);
    await expect(mutation.mutationFn({})).rejects.toThrow("Wallet or server changed");
  }
  expect(writes).toBe(1);
});
