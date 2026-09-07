// @ts-nocheck -- Isolated stateful hook harness; no native/network or writes.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import * as React from "react";
import * as Tanstack from "@tanstack/react-query";
import { bech32 } from "@scure/base";
import { authSessionCoordinator } from "../../src/services/auth-session-coordinator";
const targetAddress = bech32.encode("mirage", bech32.toWords(new Uint8Array(20).fill(7)));
const queryClient = new Tanstack.QueryClient();
let lookup = async username => ({ exists: true, address: targetAddress, username });
let lookups = 0;
let server = "offline.invalid";
let focused = true;
let ready = true;
let slug = "test";
let teamId = 1;
const effectSlots = [];
let effectCursor = 0;
const slots = [];
let cursor = 0;
let callbacks;
let writes = 0;
let exits = 0;
let effects = 0;
let checks = 0;
let checkedResult;
let matches = false;
let checkFails = false;
let lastInput;
const toasts = [];
const detail = { community: "test", team_id: "1", owner: "owner", name: "Team", description: "About team", subscriber_only: false, tag: "", deleted: false, members: [{ address: "owner" }, { address: "curator" }] };
let viewer = "owner";
authSessionCoordinator.begin(viewer);
let currentDetail = detail;
const invitations = [{ invitee: "invited", status: 0 }];
mock.module("react", () => ({ ...React,
  useState: initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef: initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useEffect: (effect, deps) => {
    const index = effectCursor++;
    const previous = effectSlots[index];
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
      previous?.cleanup?.();
      effectSlots[index] = { deps, cleanup: effect() };
    }
  },
}));
mock.module("expo-router", () => ({ useIsFocused: () => focused }));
mock.module("../../src/stores/auth-store", () => ({ useAuthStore: { getState: () => ({ walletAddress: viewer, isLoggedIn: ready }) } }));
mock.module("../../src/stores/preferences-store", () => ({ usePreferencesStore: Object.assign(selector => selector({ apiServer: server }), { getState: () => ({ apiServer: server }) }) }));
mock.module("../../src/api/client", () => ({ api: { get: async (path, params) => {
  assert.equal(path, "/get_address_from_username"); lookups++; return lookup(params.username);
} } }));
mock.module("@sentry/react-native", () => ({ addBreadcrumb() {} }));
mock.module("@tanstack/react-query", () => ({ ...Tanstack, useQueryClient: () => queryClient }));
mock.module("../../src/api/write", () => Object.fromEntries([
  "useDeleteCurationTeam", "useInviteCurator", "useLeaveCurationTeam", "useRemoveCurator",
  "useRevokeCuratorInvite", "useSetCurationSubscriberOnly", "useSetCurationTag", "useSetCurationTeamProfile", "useTransferCurationTeam",
].map(name => [name, () => ({ mutate: (input, handlers) => { writes++; callbacks = handlers; lastInput = input; } })])));
mock.module("../../src/api/write/utils/check-team-detail-settlement", () => ({ checkTeamDetailSettlement: async result => {
  checks++; checkedResult = result; if (checkFails) throw new Error("read failed"); return matches;
} }));
mock.module("../../src/api/write/utils/curation-settled-effects", () => ({ applyCurationSettledEffects: () => { effects++; } }));
mock.module("../../src/providers/toast-provider", () => ({ useToast: () => Object.fromEntries(["success", "info", "error"].map(type => [type, (...args) => toasts.push([type, ...args])])) }));
const { useTeamDetailActions } = await import("../../src/pages/curation/use-team-detail-actions");
const { TEAM_ACTION_SUCCESS, teamActionAllowed, teamActionValidation } = await import("../../src/pages/curation/team-detail-action-model");
function render() {
  cursor = 0;
  effectCursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Hook primitives are isolated above.
  return useTeamDetailActions({ slug, teamId, detail: currentDetail, viewer, invitations, onExit: () => { exits++; } });
}
const allActions = ["profile", "invite", "audience", "tag", "advanced", "transfer", "delete", "remove", "revoke", "leave"];
for (const action of allActions) {
  assert.equal(teamActionAllowed(action, detail, "owner"), action !== "leave");
  assert.equal(teamActionAllowed(action, detail, "curator"), action === "leave");
  assert.equal(teamActionAllowed(action, detail, "stranger"), false);
  assert.equal(teamActionAllowed(action, detail, null), false);
  assert.equal(teamActionAllowed(action, { ...detail, deleted: true }, "owner"), false);
}
const draft = { name: "Team", description: "", target: "owner", confirmation: "Team", enabled: false, tag: "" };
assert.equal(teamActionValidation("invite", draft, detail, invitations), "Choose another curator");
assert.equal(teamActionValidation("remove", draft, detail, invitations), "Choose another curator");
assert.equal(teamActionValidation("transfer", draft, detail, invitations), "Choose another curator");
assert.equal(teamActionValidation("invite", { ...draft, target: "curator" }, detail, invitations), "Already a curator");
assert.equal(teamActionValidation("invite", { ...draft, target: "invited" }, detail, invitations), "Invitation already pending");
assert.equal(teamActionValidation("transfer", { ...draft, target: "outsider" }, detail, invitations), "Choose a team curator");
assert.equal(teamActionValidation("delete", { ...draft, confirmation: "" }, detail, invitations), "Team name must match");

let state = render();
state.open("profile"); state = render();
state.updateDraft({ name: "Changed", description: "Keep this" }); state = render();
state.submit(); state.submit(); state.close(); state = render();
assert.equal(writes, 1); assert.equal(state.pending, true); assert.equal(state.visible, true);
state.updateDraft({ description: "Must not change" }); state = render(); assert.equal(state.draft.description, "Keep this");
callbacks.onError({ response: { status: 400, data: { error_code: "not_subscriber" } } }); state = render();
assert.deepEqual(toasts.at(-1), ["error", "Active subscription required"]);
assert.equal(state.pending, false); assert.equal(state.visible, true); assert.equal(state.draft.description, "Keep this");
state.close(); state = render(); state.open("profile"); state = render(); assert.equal(state.draft.name, "Changed");
// Role revocation after opening is checked again before submission.
viewer = "curator"; state = render(); state.submit(); assert.equal(writes, 1); viewer = "owner";
state = render(); state.submit();
const delivered = { operation: "set_profile", community: "test", team_id: 1, name: "Changed", description: "Keep this", delivery: { code: 0, txhash: "retained-tx" }, settlement: { status: "timeout" } };
callbacks.onSuccess(delivered); state = render();
assert.equal(state.syncing, true); assert.equal(state.draft.description, "Keep this");
assert.deepEqual(toasts.at(-1), ["info", "Changes still syncing"]);
assert.equal(toasts.some(t => t[0] === "success"), false);
state.submit(); assert.equal(writes, 2);
state.close(); state = render(); state.open("delete"); state = render();
assert.equal(state.action, "profile"); assert.equal(state.visible, true);
await state.checkStatus(); state = render(); assert.equal(state.syncing, true); assert.equal(effects, 0);
checkFails = true; await state.checkStatus(); state = render(); assert.deepEqual(toasts.at(-1), ["error", "Sync check failed"]);
checkFails = false; matches = true;
await Promise.all([state.checkStatus(), state.checkStatus()]); state = render();
assert.equal(checks, 3); assert.equal(checkedResult, delivered); assert.equal(effects, 1);
assert.equal(state.visible, false); assert.equal(state.syncing, false); assert.equal(state.draft.name, "");
assert.deepEqual(toasts.at(-1), ["success", "Team updated"]);
assert.equal(writes, 2); assert.equal(exits, 0);

// Every confirmed operation has a single short success and closes its sheet.
for (const action of Object.keys(TEAM_ACTION_SUCCESS)) {
  viewer = action === "leave" ? "curator" : "owner";
  state = render(); state.open(action, action === "invite" ? "new-curator" : action === "revoke" ? "invited" : "curator"); state = render();
  state.updateDraft({ confirmation: "Team" }); state = render();
  const priorToasts = toasts.length;
  const priorWrites = writes;
  await state.submit(); assert.equal(writes, priorWrites + 1);
  callbacks.onSuccess({ settlement: { status: "settled" }, delivery: { code: 0 } }); state = render();
  assert.equal(toasts.length, priorToasts + 1);
  assert.deepEqual(toasts.at(-1), ["success", TEAM_ACTION_SUCCESS[action]]);
  assert.ok(TEAM_ACTION_SUCCESS[action].split(" ").length >= 2 && TEAM_ACTION_SUCCESS[action].split(" ").length <= 4);
  assert.equal(state.visible, false); assert.equal(state.action, null);
}
assert.equal(exits, 2);
assert.equal(effects, 1); // Normal settled invalidations belong to write hooks, not duplicated here.
viewer = "owner"; state = render(); state.open("delete"); state = render(); state.submit();
const before = writes;
assert.equal(state.visible, true);
state.updateDraft({ confirmation: "Team" }); state = render(); state.submit();
assert.equal(writes, before + 1); assert.deepEqual(lastInput, { community: "test", teamId: 1 });
callbacks.onSuccess({ operation: "delete_team", settlement: { status: "timeout" }, delivery: { code: 0 } }); state = render();
assert.equal(exits, 2); // No premature navigation for a timed-out deletion.
currentDetail = { ...detail, deleted: true }; state = render(); state.submit(); assert.equal(writes, before + 1);

// Actual invite controller + QueryClient + username endpoint; all network/write boundaries mocked.
await state.checkStatus();
currentDetail = detail;
function openInvite(target) {
  state = render(); state.open("invite"); state = render();
  state.updateDraft({ target }); state = render();
}
for (const target of [" @ALICE ", "alice", ` ${targetAddress.toUpperCase()} `]) {
  openInvite(target);
  const beforeWrites = writes;
  const beforeLookups = lookups;
  const promise = state.submit(); state.submit();
  await promise;
  assert.equal(writes, beforeWrites + 1);
  assert.equal(lookups, beforeLookups + (target.includes("1") ? 0 : 1));
  assert.deepEqual(lastInput, { community: "test", teamId: 1, target: targetAddress });
  callbacks.onSuccess({ settlement: { status: "settled" }, delivery: { code: 0 } });
  state = render(); assert.equal(state.visible, false);
  assert.deepEqual(toasts.at(-1), ["success", "Invite sent"]);
}
for (const [target, resolver, message] of [
  ["mirage1broken", null, "Invalid wallet address"],
  [bech32.encode("cosmos", bech32.toWords(new Uint8Array(20))), null, "Invalid wallet address"],
  ["a b", null, "Invalid username format"],
  ["@@", null, "Enter username or address"],
  ["missing", async username => ({ exists: false, address: null, username }), "Username not found"],
  ["alice", async () => { throw Error("offline"); }, "Username lookup failed"],
  ["alice", async username => ({ exists: true, address: [targetAddress], username }), "Invalid lookup response"],
  ["alice", async () => ({ exists: true, address: targetAddress, username: "someone-else" }), "Invalid lookup response"],
]) {
  if (resolver) lookup = resolver;
  openInvite(target); const beforeWrites = writes;
  await state.submit(); state = render();
  assert.equal(writes, beforeWrites); assert.equal(state.pending, false);
  assert.equal(state.visible, true); assert.equal(state.draft.target, target);
  assert.deepEqual(toasts.at(-1), ["error", message]);
}
ready = false; openInvite("alice"); const beforeReady = lookups;
await state.submit(); assert.equal(lookups, beforeReady);
assert.deepEqual(toasts.at(-1), ["error", "Wallet not ready"]); ready = true;

for (const change of ["close", "input", "community", "team", "wallet", "server", "session", "focus", "role", "member", "pending"]) {
  let resolve;
  lookup = () => new Promise(done => { resolve = done; });
  openInvite("alice");
  const beforeWrites = writes;
  const promise = state.submit();
  assert.equal(typeof resolve, "function");
  if (change === "close") state.close();
  if (change === "input") state.updateDraft({ target: "bob" });
  if (change === "community") slug = "different";
  if (change === "team") teamId = 2;
  if (change === "wallet") viewer = "another-owner";
  if (change === "server") server = "different.invalid";
  if (change === "session") authSessionCoordinator.begin(viewer);
  if (change === "focus") focused = false;
  if (change === "role") currentDetail = { ...detail, owner: "another-owner" };
  if (change === "member") currentDetail = { ...detail, members: [...detail.members, { address: targetAddress }] };
  if (change === "pending") invitations.push({ invitee: targetAddress, status: 0 });
  state = render();
  resolve({ exists: true, address: targetAddress, username: "alice" });
  await promise; state = render();
  assert.equal(writes, beforeWrites, change); assert.equal(state.pending, false, change);
  if (change === "member") assert.deepEqual(toasts.at(-1), ["error", "Already a curator"]);
  if (change === "pending") { assert.deepEqual(toasts.at(-1), ["error", "Invitation already pending"]); invitations.pop(); }
  slug = "test"; teamId = 1; viewer = "owner"; server = "offline.invalid"; focused = true; currentDetail = detail;
  authSessionCoordinator.begin(viewer); state = render();
}
// Session changes after dispatch cannot finish a new sheet or emit stale success.
lookup = async username => ({ exists: true, address: targetAddress, username });
openInvite("alice"); await state.submit();
const beforeStaleToast = toasts.length;
authSessionCoordinator.begin(viewer);
callbacks.onSuccess({ settlement: { status: "settled" }, delivery: { code: 0 } });
state = render(); assert.equal(state.pending, false); assert.equal(state.visible, true);
assert.equal(toasts.length, beforeStaleToast);
// Unmount while resolving never dispatches.
let resolveUnmount;
lookup = () => new Promise(done => { resolveUnmount = done; });
openInvite("alice"); const beforeUnmount = writes;
const unmounted = state.submit(); effectSlots.forEach(slot => slot.cleanup?.());
resolveUnmount({ exists: true, address: targetAddress, username: "alice" }); await unmounted;
assert.equal(writes, beforeUnmount);
queryClient.clear();
