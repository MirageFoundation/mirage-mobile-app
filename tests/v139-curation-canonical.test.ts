// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
}));

mock.module("@sentry/react-native", () => ({
  addBreadcrumb: () => undefined,
  captureException: () => undefined,
}));

const {
  canonBaseAcceptCuratorInvite,
  canonBaseCreateCurationTeam,
  canonBaseDeclineCuratorInvite,
  canonBaseDeleteCurationTeam,
  canonBaseInviteCurator,
  canonBaseLeaveCurationTeam,
  canonBaseRemoveCurator,
  canonBaseRevokeCuratorInvite,
  canonBaseSetCurationPostHidden,
  canonBaseSetCurationPostTag,
  canonBaseSetCurationSubscriberOnly,
  canonBaseSetCurationTag,
  canonBaseSetCurationTeamProfile,
  canonBaseSetCurationThreadLocked,
  canonBaseSetCurationUserHidden,
  canonBaseTransferCurationTeam,
} = await import("../src/api/write/signing/canonical");

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const ENVELOPE = {
  pubkey33: hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"),
  lastBlockHashBytes: hexToBytes(
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  ),
  difficulty: 21,
  timestampMs: 1_750_000_000,
  envelopeNonce: 7n,
};

const CREATE_TEAM_HEX =
  "6d69726167652e636f72652e76313a4d73674372656174654375726174696f6e5465616d000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965065465616d2041660464657363";
const SET_PROFILE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e5465616d50726f66696c65000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366065465616d2041670464657363";
const INVITE_HEX =
  "6d69726167652e636f72652e76313a4d7367496e7669746543757261746f72000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660d6d697261676531746172676574";
const REVOKE_HEX =
  "6d69726167652e636f72652e76313a4d73675265766f6b6543757261746f72496e76697465000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660d6d697261676531746172676574";
const ACCEPT_HEX =
  "6d69726167652e636f72652e76313a4d736741636365707443757261746f72496e76697465000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503";
const DECLINE_HEX =
  "6d69726167652e636f72652e76313a4d73674465636c696e6543757261746f72496e76697465000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503";
const LEAVE_HEX =
  "6d69726167652e636f72652e76313a4d73674c656176654375726174696f6e5465616d000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503";
const REMOVE_HEX =
  "6d69726167652e636f72652e76313a4d736752656d6f766543757261746f72000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660d6d697261676531746172676574";
const TRANSFER_HEX =
  "6d69726167652e636f72652e76313a4d73675472616e736665724375726174696f6e5465616d000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660a6d6972616765316e6577";
const DELETE_HEX =
  "6d69726167652e636f72652e76313a4d736744656c6574654375726174696f6e5465616d000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503";
const HIDE_POST_TRUE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e506f737448696464656e000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366066162633132336701";
const HIDE_POST_FALSE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e506f737448696464656e000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366066162633132336700";
const HIDE_USER_TRUE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e5573657248696464656e000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660d6d6972616765317461726765746701";
const HIDE_USER_FALSE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e5573657248696464656e000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660d6d6972616765317461726765746700";
const LOCK_TRUE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e5468726561644c6f636b6564000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366066465663435366701";
const LOCK_FALSE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e5468726561644c6f636b6564000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366066465663435366700";
const SUB_ONLY_TRUE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e537562736372696265724f6e6c79000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965036601";
const SUB_ONLY_FALSE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e537562736372696265724f6e6c79000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965036600";
const TAG_ADULT_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e546167000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366056164756c74";
const TAG_EMPTY_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e546167000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f677965036600";
const POST_TAG_GORE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e506f7374546167000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f6779650366066162633132336704676f72656800";
const POST_TAG_EMPTY_OVERRIDE_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e506f7374546167000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660661626331323367006800";
const POST_TAG_CLEAR_HEX =
  "6d69726167652e636f72652e76313a4d73675365744375726174696f6e506f7374546167000220000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f0320aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa04150680c3bbc2060707640a746563686e6f6c6f67796503660661626331323367006801";

describe("v1.39 canonical curation messages", () => {
  test("encodes create/profile/invite/revoke/accept/decline/leave/remove/transfer/delete", () => {
    expect(toHex(canonBaseCreateCurationTeam({
      ...ENVELOPE, community: "technology", name: "Team A", description: "desc",
    }))).toBe(CREATE_TEAM_HEX);
    expect(toHex(canonBaseSetCurationTeamProfile({
      ...ENVELOPE, community: "technology", team_id: 3, name: "Team A", description: "desc",
    }))).toBe(SET_PROFILE_HEX);
    expect(toHex(canonBaseInviteCurator({
      ...ENVELOPE, community: "technology", team_id: 3, target: "mirage1target",
    }))).toBe(INVITE_HEX);
    expect(toHex(canonBaseRevokeCuratorInvite({
      ...ENVELOPE, community: "technology", team_id: 3, target: "mirage1target",
    }))).toBe(REVOKE_HEX);
    expect(toHex(canonBaseAcceptCuratorInvite({
      ...ENVELOPE, community: "technology", team_id: 3,
    }))).toBe(ACCEPT_HEX);
    expect(toHex(canonBaseDeclineCuratorInvite({
      ...ENVELOPE, community: "technology", team_id: 3,
    }))).toBe(DECLINE_HEX);
    expect(toHex(canonBaseLeaveCurationTeam({
      ...ENVELOPE, community: "technology", team_id: 3,
    }))).toBe(LEAVE_HEX);
    expect(toHex(canonBaseRemoveCurator({
      ...ENVELOPE, community: "technology", team_id: 3, target: "mirage1target",
    }))).toBe(REMOVE_HEX);
    expect(toHex(canonBaseTransferCurationTeam({
      ...ENVELOPE, community: "technology", team_id: 3, new_owner: "mirage1new",
    }))).toBe(TRANSFER_HEX);
    expect(toHex(canonBaseDeleteCurationTeam({
      ...ENVELOPE, community: "technology", team_id: 3,
    }))).toBe(DELETE_HEX);
  });

  test("encodes hide/lock/subscriber-only/tag boolean and empty-vs-clear post tags", () => {
    expect(toHex(canonBaseSetCurationPostHidden({
      ...ENVELOPE, community: "technology", team_id: 3, target: "abc123", hidden: true,
    }))).toBe(HIDE_POST_TRUE_HEX);
    expect(toHex(canonBaseSetCurationPostHidden({
      ...ENVELOPE, community: "technology", team_id: 3, target: "abc123", hidden: false,
    }))).toBe(HIDE_POST_FALSE_HEX);
    expect(toHex(canonBaseSetCurationUserHidden({
      ...ENVELOPE, community: "technology", team_id: 3, target: "mirage1target", hidden: true,
    }))).toBe(HIDE_USER_TRUE_HEX);
    expect(toHex(canonBaseSetCurationUserHidden({
      ...ENVELOPE, community: "technology", team_id: 3, target: "mirage1target", hidden: false,
    }))).toBe(HIDE_USER_FALSE_HEX);
    expect(toHex(canonBaseSetCurationThreadLocked({
      ...ENVELOPE, community: "technology", team_id: 3, root_hash: "def456", locked: true,
    }))).toBe(LOCK_TRUE_HEX);
    expect(toHex(canonBaseSetCurationThreadLocked({
      ...ENVELOPE, community: "technology", team_id: 3, root_hash: "def456", locked: false,
    }))).toBe(LOCK_FALSE_HEX);
    expect(toHex(canonBaseSetCurationSubscriberOnly({
      ...ENVELOPE, community: "technology", team_id: 3, enabled: true,
    }))).toBe(SUB_ONLY_TRUE_HEX);
    expect(toHex(canonBaseSetCurationSubscriberOnly({
      ...ENVELOPE, community: "technology", team_id: 3, enabled: false,
    }))).toBe(SUB_ONLY_FALSE_HEX);
    expect(toHex(canonBaseSetCurationTag({
      ...ENVELOPE, community: "technology", team_id: 3, tag: "adult",
    }))).toBe(TAG_ADULT_HEX);
    expect(toHex(canonBaseSetCurationTag({
      ...ENVELOPE, community: "technology", team_id: 3, tag: "",
    }))).toBe(TAG_EMPTY_HEX);
    expect(toHex(canonBaseSetCurationPostTag({
      ...ENVELOPE, community: "technology", team_id: 3, target: "abc123", tag: "gore", clear: false,
    }))).toBe(POST_TAG_GORE_HEX);
    expect(toHex(canonBaseSetCurationPostTag({
      ...ENVELOPE, community: "technology", team_id: 3, target: "abc123", tag: "", clear: false,
    }))).toBe(POST_TAG_EMPTY_OVERRIDE_HEX);
    expect(toHex(canonBaseSetCurationPostTag({
      ...ENVELOPE, community: "technology", team_id: 3, target: "abc123", tag: "", clear: true,
    }))).toBe(POST_TAG_CLEAR_HEX);
  });
});
