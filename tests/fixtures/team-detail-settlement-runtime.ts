// @ts-nocheck -- Read-only settlement contract with mocked read endpoints.
import { mock } from "bun:test";
import assert from "node:assert/strict";
let detail = { name: "New", description: "Updated", owner: "next-owner", subscriber_only: true, tag: "adult", members: [{ address: "next-owner" }] };
let invitations = { items: [{ invitee: "invited", status: 0 }, { invitee: "revoked", status: 2 }] };
let teams = { items: [{ team_id: "2", deleted: false }] };
const calls = [];
mock.module("../../src/api/read/endpoints/curation", () => ({
  getCommunityTeam: async params => { calls.push(["detail", params]); return detail; },
  getCommunityTeamInvitations: async params => { calls.push(["invites", params]); return invitations; },
  getCommunityTeams: async params => { calls.push(["teams", params]); return teams; },
}));
const { checkTeamDetailSettlement } = await import("../../src/api/write/utils/check-team-detail-settlement");
const base = { community: "test", team_id: 1, delivery: { code: 0, txhash: "original" }, settlement: { status: "timeout" } };
for (const fields of [
  { operation: "set_profile", name: "New", description: "Updated" },
  { operation: "invite", target: "invited" },
  { operation: "revoke", target: "revoked" },
  { operation: "subscriber_only", enabled: true },
  { operation: "team_tag", tag: "adult" },
  { operation: "transfer", new_owner: "next-owner" },
  { operation: "leave" }, { operation: "remove", target: "removed" }, { operation: "delete_team" },
]) assert.equal(await checkTeamDetailSettlement({ ...base, ...fields }, "former-owner"), true);
assert.deepEqual(calls.find(([kind]) => kind === "invites"), ["invites", { slug: "test", teamId: 1, viewer: "former-owner" }]);
assert.deepEqual(calls.find(([kind]) => kind === "teams"), ["teams", { slug: "test" }]);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "set_profile", name: "wrong", description: "Updated" }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "invite", target: "revoked" }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "revoke", target: "invited" }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "transfer", new_owner: "wrong" }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "leave" }, "next-owner"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "remove", target: "next-owner" }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "subscriber_only", enabled: false }, "viewer"), false);
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "team_tag", tag: "" }, "viewer"), false);
teams = { items: [{ team_id: "1", deleted: false }] };
assert.equal(await checkTeamDetailSettlement({ ...base, operation: "delete_team" }, "viewer"), false);
