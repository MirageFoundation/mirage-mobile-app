// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { CURATOR_INVITE_STATUS } from "../src/domain/communities";
import {
  matchesCreatedTeam,
  matchesDeletedTeam,
  matchesHiddenPostPresence,
  matchesInviteStatus,
  matchesMemberPresence,
  matchesModerationLeaf,
  matchesPendingInvite,
  matchesTeamProfile,
  normalizePostTagFields,
} from "../src/api/write/utils/curation-model";

describe("curation settlement predicates", () => {
  test("create/delete/profile/invite/member predicates", () => {
    expect(matchesCreatedTeam({
      items: [{ owner: "MIRAGE1OWNER", name: "Team A", deleted: false, team_id: "3" }],
    }, { owner: "mirage1owner", name: "Team A" })).toBe(true);
    expect(matchesDeletedTeam({
      items: [{ team_id: "3", deleted: true }],
    }, 3)).toBe(true);
    expect(matchesTeamProfile({
      name: "Team A",
      description: "desc",
    }, { name: "Team A", description: "desc" })).toBe(true);
    expect(matchesPendingInvite({
      items: [{ invitee: "mirage1target", status: CURATOR_INVITE_STATUS.PENDING, team_id: 3 }],
    }, "mirage1target", 3)).toBe(true);
    expect(matchesInviteStatus({
      items: [{ invitee: "mirage1target", status: CURATOR_INVITE_STATUS.REVOKED }],
    }, "mirage1target", CURATOR_INVITE_STATUS.REVOKED)).toBe(true);
    expect(matchesMemberPresence({
      members: [{ address: "mirage1cur" }],
    }, "mirage1cur", true)).toBe(true);
  });

  test("preserves null vs empty post tags and hide presence", () => {
    expect(matchesModerationLeaf({
      items: [{ post_id: "aa".repeat(32), post_hidden: true, user_hidden: false, thread_locked: false, post_tag: null }],
    }, "aa".repeat(32), { post_tag: null })).toBe(true);
    expect(matchesModerationLeaf({
      items: [{ post_id: "aa".repeat(32), post_hidden: true, user_hidden: false, thread_locked: false, post_tag: "" }],
    }, "aa".repeat(32), { post_tag: "" })).toBe(true);
    expect(matchesModerationLeaf({
      items: [{ post_id: "aa".repeat(32), post_hidden: true, user_hidden: false, thread_locked: false, post_tag: null }],
    }, "aa".repeat(32), { post_tag: "" })).toBe(false);
    expect(matchesHiddenPostPresence({
      items: [{ post_id: "aa".repeat(32) }],
    }, "aa".repeat(32), true)).toBe(true);
    expect(normalizePostTagFields({
      community: "bitcoin",
      teamId: 3,
      target: "mirage1target",
      tag: "",
      clear: false,
    }).clear).toBe(false);
  });
});
