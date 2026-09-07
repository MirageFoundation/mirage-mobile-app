// @ts-nocheck -- Isolated rendered UI harness; no native modules or transactions.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";

const slots = new Map();
let scope = "";
let cursor = 0;
let backHandler;
let keyboardDismissals = 0;
const events = [];
mock.module("react", () => ({ ...React,
  useState: initial => {
    const key = `${scope}:${cursor++}`;
    if (!slots.has(key)) slots.set(key, initial);
    return [slots.get(key), value => slots.set(key, typeof value === "function" ? value(slots.get(key)) : value)];
  },
  useRef: initial => ({ current: initial }),
  useCallback: fn => fn,
  useEffect: fn => { fn(); },
}));
mock.module("react-native", () => ({
  View: "View", Pressable: "Pressable", ScrollView: "ScrollView", RefreshControl: "RefreshControl", ActivityIndicator: "ActivityIndicator",
  Keyboard: { dismiss: () => { keyboardDismissals++; } },
  BackHandler: { addEventListener: (_event, fn) => { backHandler = fn; return { remove() {} }; } },
  useWindowDimensions: () => ({ height: 800 }),
}));
mock.module("@gorhom/bottom-sheet", () => Object.fromEntries([
  "BottomSheetBackdrop", "BottomSheetModal", "BottomSheetScrollView", "BottomSheetTextInput",
].map(name => [name, name])));
mock.module("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
mock.module("expo-router", () => ({ useLocalSearchParams: () => ({ slug: "test", teamId: "1" }) }));
mock.module("../../src/navigation/guarded-router", () => ({ useRouter: () => ({ back: () => events.push("back") }) }));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) }));
mock.module("react-native-unistyles", () => ({ useUnistyles: () => ({ theme: { colors: {
  text: { default: "white", subtle: "gray" }, background: { default: "black", subtle: "gray" },
  border: { default: "gray", subtle: "gray" }, primary: { 500: "orange" }, error: { 500: "red" },
} } }) }));
mock.module("../../src/components/ui/primitives", () => ({ Text: "Text", Box: "Box" }));
mock.module("../../src/pages/curation/community-teams-styles", () => ({ styles: {} }));
mock.module("../../src/pages/curation/use-team-create-sheet-presentation", () => ({
  useTeamCreateSheetPresentation: (_visible, close) => ({ sheet: { current: null }, onDismiss: close, onChange() {}, focused: true }),
}));
const detail = { name: "Signal Desk", description: "Thoughtful curation", owner: "owner", members: [
  { address: "owner", username: "Leader" }, { address: "curator", username: "Member" },
], subscriber_count: "5", subscriber_only: false, tag: "", deleted: false };
const actions = {
  action: null, visible: false, pending: false, syncing: false, locked: false,
  draft: { name: detail.name, description: detail.description, target: "", confirmation: "", tag: "", enabled: false },
  open: (...args) => events.push(args), updateDraft: patch => events.push(patch),
  close: () => events.push("close"), submit: () => events.push("submit"), checkStatus: () => events.push("check"), resume: () => events.push("resume"),
};
let controller = {
  slug: "test", detail, actions, role: "owner", isOwner: true, canLeave: false, isValid: true, isLoading: false, isError: false,
  invitations: [{ invitee: "waiting", status: 0, created_height: 1 }, { invitee: "joined", status: 1, created_height: 2 }],
  invitationsLoading: false, invitationsError: false, retryInvitations: () => events.push("retry invites"),
  hiddenUsers: [], hiddenPosts: [], usersLoading: false, postsLoading: false, usersError: false, postsError: false,
  usersHasMore: false, postsHasMore: false, retryUsers: () => events.push("retry users"), retryPosts: () => events.push("retry posts"),
  loadMoreUsers: () => events.push("more users"), loadMorePosts: () => events.push("more posts"),
  refetch: () => events.push("retry team"), openCommunity: () => events.push("community"),
};
mock.module("../../src/pages/curation/use-community-team-detail-controller", () => ({ useCommunityTeamDetailController: () => controller }));
const { CommunityTeamDetailScreen } = await import("../../src/pages/curation/community-team-detail-content");
const { TeamDetailActionSheet } = await import("../../src/pages/curation/team-detail-action-sheet");

function expand(node, path = "root") {
  if (node == null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}:${i}`));
  if (typeof node.type === "function") {
    scope = `${path}:${node.type.name}`; cursor = 0;
    return expand(node.type(node.props), scope);
  }
  return { ...node, props: { ...node.props, children: React.Children.toArray(node.props?.children).map((child, i) => expand(child, `${path}:${i}`)) } };
}
function nodes(node) { return !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props.children)]; }
function text(node) { return node == null ? "" : typeof node !== "object" ? String(node) : Array.isArray(node) ? node.map(text).join(" ").replace(/\s+/g, " ") : text(node.props.children); }
function render() { return expand(React.createElement(CommunityTeamDetailScreen)); }
function button(tree, label) { return nodes(tree).find(n => n.props.accessibilityLabel === label); }
function press(tree, label) { const node = button(tree, label); assert.ok(node, label); assert.ok(!node.props.disabled, label); node.props.onPress(); }

let tree = render();
assert.match(text(tree), /Signal Desk/); assert.match(text(tree), /Thoughtful curation/);
assert.match(text(tree), /Owner/); assert.match(text(tree), /Curator/);
assert.equal(nodes(tree).filter(n => n.type === "BottomSheetTextInput").length, 0);
assert.equal(nodes(tree).filter(n => n.type === "Text" && text(n) === detail.name).length, 1);
assert.equal(nodes(tree).find(n => n.props.accessibilityRole === "header").props.children[0], detail.name);
const scroll = nodes(tree).find(n => n.type === "ScrollView");
assert.equal(scroll.props.contentInsetAdjustmentBehavior, "never");
assert.equal(scroll.props.contentContainerStyle.paddingTop, undefined);
assert.deepEqual(nodes(tree).filter(n => n.props.accessibilityRole === "tab").map(n => n.props.accessibilityLabel), ["Members", "Invitations", "Moderation"]);
assert.ok(text(tree).indexOf("Moderation") < text(tree).indexOf("Leader"));
assert.doesNotMatch(text(tree), /Curator team|c\/test|Open community|No team tag|TEAM SETTINGS/);
assert.equal(button(tree, "Edit team"), undefined);
press(tree, "Invite curator"); assert.deepEqual(events.at(-1), ["invite"]);
assert.equal(button(tree, "Remove Leader"), undefined);
press(tree, "Remove Member"); assert.deepEqual(events.at(-1), ["remove", "curator"]);
press(tree, "Team options"); tree = render();
assert.equal(button(tree, "Team options").props.accessibilityState.expanded, true);
press(tree, "Edit team"); assert.deepEqual(events.at(-1), ["profile"]);
press(tree, "Posting audience"); assert.deepEqual(events.at(-1), ["audience"]);
press(tree, "Content tag"); assert.deepEqual(events.at(-1), ["tag"]);
press(tree, "Advanced actions"); assert.deepEqual(events.at(-1), ["advanced"]);
assert.equal(button(tree, "Delete team"), undefined);
press(tree, "Invitations"); tree = render();
assert.match(text(tree), /Pending invitations \(1\)/); assert.doesNotMatch(text(tree), /Accepted/);
press(tree, "Show invitation history"); tree = render(); assert.match(text(tree), /Accepted/);
assert.equal(button(tree, "Revoke invitation for joined"), undefined);
press(tree, "Revoke invitation for waiting"); assert.deepEqual(events.at(-1), ["revoke", "waiting"]);
controller.invitationsLoading = true; assert.match(text(render()), /Loading invitations/);
controller.invitationsLoading = false; controller.invitationsError = true;
tree = render(); press(tree, "Retry invitations"); assert.equal(events.at(-1), "retry invites");
controller.invitationsError = false; controller.invitations = [];
assert.match(text(render()), /No pending invitations/);
press(render(), "Members");
controller.detail = { ...detail, description: "  ", members: [], subscriber_count: "1" };
tree = render(); assert.doesNotMatch(text(tree), /hasn't added a description/); assert.match(text(tree), /No curators to show/);
assert.match(text(tree), /0 members · 1 subscriber · Owner/);
controller.detail = detail;
for (const role of ["curator", "none"]) {
  controller = { ...controller, role, isOwner: false, canLeave: role === "curator" };
  tree = render();
  assert.equal(button(tree, "Invite curator"), undefined); assert.equal(button(tree, "Edit team"), undefined);
  assert.equal(!!button(tree, "Team options"), role === "curator");
  assert.equal(!!button(tree, "Moderation"), role === "curator");
  assert.equal(!!button(tree, "Invitations"), role === "curator");
  assert.match(text(tree), /Thoughtful curation/); assert.match(text(tree), /Leader/);
  press(tree, "Open community"); assert.equal(events.at(-1), "community");
  if (role === "curator") {
    press(tree, "Team options"); tree = render();
    assert.equal(button(tree, "Edit team"), undefined);
    press(tree, "Leave team"); assert.deepEqual(events.at(-1), ["leave"]);
    press(tree, "Invitations"); tree = render();
    assert.equal(button(tree, "Revoke invitation for waiting"), undefined);
    press(tree, "Members");
  } else {
    assert.equal(nodes(tree).filter(n => n.props.accessibilityRole === "tab").length, 0);
  }
}
controller = { ...controller, role: "curator", canLeave: true };
tree = render(); press(tree, "Moderation"); tree = render(); press(tree, "Hidden users"); tree = render(); assert.match(text(tree), /No hidden users/);
controller.usersLoading = true; tree = render(); assert.match(text(tree), /Loading\.\.\./);
controller.usersLoading = false; controller.usersError = true; tree = render(); press(tree, "Retry hidden users"); assert.equal(events.at(-1), "retry users");
controller.usersError = false; controller.hiddenUsers = [{ address: "hidden-user", username: "Hidden Person" }]; controller.usersHasMore = true;
tree = render(); assert.match(text(tree), /Hidden Person/); press(tree, "Load more hidden users"); assert.equal(events.at(-1), "more users");
press(tree, "Hidden posts"); tree = render(); assert.match(text(tree), /No hidden posts/);
controller.postsError = true; tree = render(); press(tree, "Retry hidden posts"); assert.equal(events.at(-1), "retry posts");
controller.postsError = false; controller.hiddenPosts = [{ post_id: "post", title: "Hidden title" }]; controller.postsHasMore = true;
tree = render(); assert.match(text(tree), /Hidden title/); press(tree, "Load more hidden posts"); assert.equal(events.at(-1), "more posts");
controller = { ...controller, role: "none", canLeave: false, detail: { ...detail, deleted: true } };
tree = render(); assert.match(text(tree), /team has been deleted/); assert.equal(button(tree, "Hidden posts"), undefined);
controller.isLoading = true; tree = render(); assert.ok(button(tree, "Loading team"));
controller.isLoading = false; controller.isError = true; tree = render(); press(tree, "Retry team"); assert.equal(events.at(-1), "retry team");
controller.isError = false; controller.isValid = false; assert.match(text(render()), /Team not found/);
controller.isValid = true; controller.actions = { ...actions, syncing: true }; tree = render(); press(tree, "Review pending team change"); assert.equal(events.at(-1), "resume");

function sheet(action, overrides = {}) {
  return expand(React.createElement(TeamDetailActionSheet, { detail, invitations: controller.invitations,
    actions: { ...actions, visible: true, action, ...overrides } }), "sheet");
}
tree = sheet("profile");
const modal = nodes(tree).find(n => n.type === "BottomSheetModal");
assert.equal(modal.props.keyboardBehavior, "interactive"); assert.equal(modal.props.android_keyboardInputMode, "adjustResize");
assert.equal(modal.props.maxDynamicContentSize, 732);
assert.equal(nodes(tree).find(n => n.type === "BottomSheetScrollView").props.keyboardShouldPersistTaps, "handled");
button(tree, "Team name").props.onChangeText("New name"); assert.deepEqual(events.at(-1), { name: "New name" });
press(tree, "Save changes"); assert.equal(events.at(-1), "submit"); assert.ok(keyboardDismissals > 0);
assert.equal(backHandler(), true); assert.equal(events.at(-1), "close");
modal.props.onDismiss(); assert.equal(events.at(-1), "close");
tree = sheet("profile", { pending: true, locked: true });
assert.equal(button(tree, "Close team action").props.disabled, true);
assert.equal(button(tree, "Save changes").props.disabled, true);
assert.equal(button(tree, "Team name").props.editable, false);
assert.equal(nodes(tree).find(n => n.type === "BottomSheetModal").props.enablePanDownToClose, false);
const count = events.length; backHandler(); assert.equal(events.length, count);
tree = sheet("profile", { syncing: true, locked: true });
assert.match(text(tree), /submitted and is still syncing/); press(tree, "Check change status"); assert.equal(events.at(-1), "check");
for (const action of ["delete", "transfer"]) {
  tree = sheet(action); assert.equal(button(tree, action === "delete" ? "Delete team" : "Transfer ownership").props.disabled, true);
  tree = sheet(action, { draft: { ...actions.draft, confirmation: detail.name, target: "curator" } });
  press(tree, action === "delete" ? "Delete team" : "Transfer ownership"); assert.equal(events.at(-1), "submit");
}
tree = sheet("transfer"); assert.ok(button(tree, "Member")); assert.equal(button(tree, "Leader"), undefined);
tree = sheet("advanced"); press(tree, "Transfer ownership"); assert.deepEqual(events.at(-1), ["transfer"]);
press(tree, "Delete team"); assert.deepEqual(events.at(-1), ["delete"]);
tree = sheet("audience"); press(tree, "Subscribers"); assert.deepEqual(events.at(-1), { enabled: true });
tree = sheet("tag"); press(tree, "No team tag"); assert.deepEqual(events.at(-1), { tag: "" });
