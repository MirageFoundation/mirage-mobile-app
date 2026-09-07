// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

describe("curation write contract", () => {
  test("canonical paths and body fields are wired, without reject/cancel/hide-restore aliases", () => {
    const endpoint = source("src/api/write/endpoints/curation.ts");
    for (const path of [
      "/core/create_curation_team",
      "/core/set_curation_team_profile",
      "/core/invite_curator",
      "/core/revoke_curator_invite",
      "/core/accept_curator_invite",
      "/core/decline_curator_invite",
      "/core/leave_curation_team",
      "/core/remove_curator",
      "/core/transfer_curation_team",
      "/core/delete_curation_team",
      "/core/set_curation_post_hidden",
      "/core/set_curation_user_hidden",
      "/core/set_curation_thread_locked",
      "/core/set_curation_subscriber_only",
      "/core/set_curation_tag",
      "/core/set_curation_post_tag",
    ]) {
      expect(endpoint).toContain(`"${path}"`);
    }
    expect(endpoint).not.toContain("/core/reject_curator_invite");
    expect(endpoint).not.toContain("/core/cancel_curator_invite");
    expect(endpoint).not.toContain("/core/hide_post");
    expect(endpoint).not.toContain("/core/restore_post");
    expect(endpoint).not.toContain("set_global_default_team");
    expect(endpoint).toContain("normalizePostTagFields");
  });

  test("mutation hooks use centralized mutation keys", () => {
    const hooks = source("src/api/write/hooks/use-curation.ts");
    expect(hooks).toContain("mutationKey");
    expect(hooks).toContain("mutationKeys.curation.createTeam()");
    expect(hooks).toContain("mutationKeys.curation.setPostTag()");
    expect(hooks).toContain("applyCurationSettledEffects");
  });
});
