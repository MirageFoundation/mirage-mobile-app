// @ts-nocheck -- Isolated hook/component harness; no native modules or transactions.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";

const slots = [];
let cursor = 0;
let callbacks;
let mutationPending = false;
let submissions = 0;
let refetches = 0;
let settledEffects = 0;
let list = { items: [] };
let readError = false;
const toasts = [];
const cleanups = [];
let backHandler;
let keyboardDismissals = 0;

mock.module("react", () => ({
  ...React,
  useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  },
  useRef: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useCallback: fn => fn,
  useMemo: fn => fn(),
  useEffect: fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); },
}));
mock.module("@sentry/react-native", () => ({ addBreadcrumb() {} }));
mock.module("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
mock.module("../../src/api/write", () => ({ useCreateCurationTeam: () => ({
  isPending: mutationPending,
  mutate: (input, handlers) => {
    submissions++;
    mutationPending = true;
    callbacks = handlers;
  },
}) }));
mock.module("../../src/api/write/utils/curation-settled-effects", () => ({
  applyCurationSettledEffects: () => { settledEffects++; },
}));
mock.module("../../src/providers/toast-provider", () => ({ useToast: () => ({
  success: (...args) => toasts.push(["success", ...args]),
  error: (...args) => toasts.push(["error", ...args]),
  info: (...args) => toasts.push(["info", ...args]),
}) }));
const { useCommunityTeamCreate } = await import("../../src/pages/curation/use-community-team-create");
function renderFlow() {
  cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Isolated hook primitives above.
  return useCommunityTeamCreate({
    slug: "test", walletAddress: "fixture-wallet",
    refetch: async () => { refetches++; return { data: list, isError: readError }; },
  });
}
let flow = renderFlow();
flow.open();
flow.setName("Test team");
flow.setDescription("Keep my draft");
flow = renderFlow();
assert.equal(flow.visible, true);
flow.handleCreate({ name: flow.name, description: flow.description });
flow.handleCreate({ name: flow.name, description: flow.description });
flow.close();
flow = renderFlow();
assert.equal(submissions, 1);
assert.equal(flow.pending, true);
assert.equal(flow.visible, true);

// Expected failure retains both draft fields and the open sheet.
mutationPending = false;
callbacks.onError({ response: { status: 400, data: { error_code: "not_subscriber", error: "active subscription required" } } });
flow = renderFlow();
assert.deepEqual(toasts, [["error", "Active subscription required"]]);
assert.equal(flow.name, "Test team");
assert.equal(flow.description, "Keep my draft");
assert.equal(flow.visible, true);
assert.equal(flow.pending, false);
flow.close();
flow = renderFlow();
assert.equal(flow.visible, false);
flow.open();
flow = renderFlow();
assert.equal(flow.description, "Keep my draft");

// A confirmed indexed result clears/closes and reports success exactly once.
flow.handleCreate({ name: flow.name, description: flow.description });
mutationPending = false;
callbacks.onSuccess({ settlement: { status: "settled" }, delivery: { code: 0, txhash: "confirmed-tx" } });
flow = renderFlow();
assert.equal(flow.visible, false);
assert.equal(flow.name, "");
assert.equal(flow.description, "");
assert.deepEqual(toasts.at(-1), ["success", "Team created"]);
assert.equal(toasts.filter(t => t[0] === "success").length, 1);
assert.equal(refetches, 0); // Immediate success relies on write-hook centralized invalidation.
flow.open();
flow = renderFlow();
assert.equal(flow.name, "");
assert.equal(flow.description, "");
assert.equal(flow.syncing, false);

// Delivery + timeout is not confirmed success; preserve draft and block resubmit.
flow.setName("Waiting team");
flow.setDescription("Waiting draft");
flow = renderFlow();
flow.handleCreate({ name: flow.name, description: flow.description });
mutationPending = false;
callbacks.onSuccess({
  settlement: { status: "timeout" }, delivery: { code: 0, txhash: "waiting-tx" },
  operation: "create_team", community: "test", team_id: 0, name: "Waiting team",
});
flow = renderFlow();
assert.equal(flow.syncing, true);
assert.equal(flow.visible, true);
assert.equal(flow.name, "Waiting team");
assert.equal(flow.description, "Waiting draft");
assert.deepEqual(toasts.at(-1), ["info", "Team still syncing"]);
assert.equal(toasts.filter(t => t[0] === "success").length, 1);
const submittedBeforeCheck = submissions;
flow.handleCreate({ name: flow.name, description: flow.description });
assert.equal(submissions, submittedBeforeCheck);
flow.close();
flow = renderFlow();
assert.equal(flow.visible, false);
flow.open();
flow = renderFlow();
assert.equal(flow.syncing, true);
assert.equal(flow.description, "Waiting draft");
await flow.checkStatus();
flow = renderFlow();
assert.equal(flow.syncing, true);
assert.equal(settledEffects, 0);
readError = true;
await flow.checkStatus();
flow = renderFlow();
assert.deepEqual(toasts.at(-1), ["error", "Sync check failed"]);
assert.equal(flow.description, "Waiting draft");
readError = false;
list = { items: [{ owner: "fixture-wallet", name: "Waiting team", deleted: false }] };
await Promise.all([flow.checkStatus(), flow.checkStatus()]);
flow = renderFlow();
assert.equal(settledEffects, 1);
assert.equal(refetches, 3);
assert.equal(submissions, submittedBeforeCheck);
assert.equal(flow.visible, false);
assert.equal(flow.syncing, false);
assert.equal(flow.name, "");
assert.equal(flow.description, "");
assert.equal(toasts.filter(t => t[0] === "success").length, 2);
await flow.checkStatus();
assert.equal(refetches, 3);

// Inspect the rendered sheet contract and invoke keyboard/back/dismiss handlers.
mock.module("react-native", () => ({
  View: "View", Pressable: "Pressable", FlatList: "FlatList", RefreshControl: "RefreshControl",
  Keyboard: { dismiss: () => { keyboardDismissals++; } },
  BackHandler: { addEventListener: (_event, fn) => { backHandler = fn; return { remove() {} }; } },
  useWindowDimensions: () => ({ height: 800 }),
}));
mock.module("@gorhom/bottom-sheet", () => Object.fromEntries([
  "BottomSheetBackdrop", "BottomSheetModal", "BottomSheetScrollView", "BottomSheetTextInput",
].map(name => [name, name])));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) }));
mock.module("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme: { colors: { text: { default: "white", subtle: "gray" }, background: { default: "black" }, border: { default: "gray" }, primary: { 500: "orange" } } } }),
}));
mock.module("../../src/components/ui/primitives", () => ({ Text: "Text", Box: "Box" }));
mock.module("../../src/pages/curation/community-teams-styles", () => ({ styles: {} }));
// Presentation is exercised separately against installed Gorhom with commit/RAF ordering.
mock.module("../../src/pages/curation/use-team-create-sheet-presentation", () => ({
  useTeamCreateSheetPresentation: (_visible, close) => ({ sheet: { current: null }, onDismiss: close, onChange() {}, focused: true }),
}));
const { CommunityTeamsCreate } = await import("../../src/pages/curation/community-teams-create");
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
let closes = 0;
let uiSubmits = 0;
function renderSheet(pending, syncing = false) {
  cursor = 20;
  return CommunityTeamsCreate({ creation: {
    ...flow, visible: true, pending, syncing, name: "Team", description: "Draft",
    close: () => { closes++; }, handleCreate: () => { uiSubmits++; },
  } });
}
let sheet = renderSheet(true);
assert.equal(sheet.props.enablePanDownToClose, false);
assert.equal(sheet.props.keyboardBehavior, "interactive");
assert.equal(sheet.props.keyboardBlurBehavior, "restore");
assert.equal(sheet.props.android_keyboardInputMode, "adjustResize");
assert.equal(sheet.props.maxDynamicContentSize, 732);
assert.equal(sheet.props.topInset, 44);
assert.equal(sheet.props.backdropComponent({}).props.pressBehavior, "none");
assert.equal(backHandler(), true);
assert.equal(closes, 0);
let children = nodes(sheet);
assert.ok(children.filter(n => n.type === "BottomSheetTextInput").every(n => n.props.editable === false));
assert.ok(children.filter(n => n.type === "Pressable").every(n => n.props.disabled === true));
const scroll = children.find(n => n.type === "BottomSheetScrollView");
assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
assert.equal(scroll.props.contentContainerStyle[1].paddingBottom, 58);
assert.equal(scroll.props.accessibilityViewIsModal, true);

sheet = renderSheet(false);
assert.equal(sheet.props.stackBehavior, "replace");
assert.equal(sheet.props.enablePanDownToClose, true);
assert.equal(sheet.props.backdropComponent({}).props.pressBehavior, "close");
backHandler();
assert.equal(closes, 1);
sheet.props.onDismiss();
assert.equal(closes, 2);
children = nodes(sheet);
children.find(n => n.props.accessibilityLabel === "Create team").props.onPress();
assert.equal(keyboardDismissals, 1);
assert.equal(uiSubmits, 1);
sheet = renderSheet(false, true);
children = nodes(sheet);
assert.equal(children.some(n => n.props.accessibilityLabel === "Create team"), false);
assert.equal(children.some(n => n.props.accessibilityLabel === "Check team status"), true);
assert.ok(children.filter(n => n.type === "BottomSheetTextInput").every(n => n.props.editable === false));
cleanups.forEach(cleanup => cleanup());

mock.module("expo-router", () => ({ useLocalSearchParams: () => ({ slug: "life" }) }));
mock.module("../../src/navigation/guarded-router", () => ({ useRouter: () => ({ back() {}, push() {} }) }));
mock.module("../../src/stores", () => ({ useAuthStore: select => select({ walletAddress: "fixture-wallet" }) }));
let teams = [];
mock.module("../../src/api/read", () => ({ useCommunityTeams: () => ({ data: { items: teams }, refetch: async () => ({ isError: false }) }) }));
mock.module("../../src/pages/curation/community-teams-header", () => ({ CommunityTeamsHeader: "Header" }));
mock.module("../../src/pages/curation/community-teams-row", () => ({ CommunityTeamsRow: "Row" }));
const { CommunityTeamsScreen } = await import("../../src/pages/curation/community-teams-content");
function renderScreen() {
  cursor = 100;
  return CommunityTeamsScreen();
}
for (const items of [[], [{ team_id: "fixture-team", name: "Existing team" }]]) {
  teams = items;
  const tree = renderScreen();
  const list = nodes(tree).find(node => node.type === "FlatList");
  const launch = list.props.ListHeaderComponent;
  assert.equal(launch.props.accessibilityLabel, "Create team");
  assert.notEqual(launch.props.disabled, true);
  launch.props.onPress();
  const creation = nodes(renderScreen()).find(node => node.type === CommunityTeamsCreate).props.creation;
  assert.equal(creation.visible, true, "launch event reaches creation state even with an empty team list");
  creation.close();
}
