// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { mutationKeys } from "../src/api/write/mutation-keys";
import { queryKeys } from "../src/api/read/query-keys";
import { CURATOR_INVITE_STATUS } from "../src/domain/communities";

const ROOT = join(import.meta.dir, "..");
const SCAN_DIRS = ["src", "app", "tests"];
const SKIP_NAMES = new Set([
  "retired-feature-contract.test.ts",
  "legacy-feature-persistence.test.ts",
  "signup-without-invites.test.ts",
  "deferred-campaign.test.ts",
  "retired-route-dispatch.test.ts",
]);

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "docs") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(name) && !SKIP_NAMES.has(name)) files.push(full);
  }
  return files;
}

const scanned = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

const RETIRED_CALLS = [
  "/core/enable_agent",
  "/core/disable_agent",
  "/core/set_agents",
  "/core/annotate",
  "/validate_invite_code",
  "/get_invite_codes",
  "/rewards/claim",
  "/referrals/precheck",
  "/referrals/precheck_opt_in",
  "/get_agents",
];

describe("retired feature contract", () => {
  test("preserves creator claims and curator invitations", () => {
    expect(typeof mutationKeys.creatorEarnings.claim).toBe("function");
    expect(typeof queryKeys.curatorInvitations).toBe("function");
    expect(typeof queryKeys.creatorEarnings).toBe("function");
    expect(CURATOR_INVITE_STATUS.PENDING).toBeDefined();
    expect(Object.values(CURATOR_INVITE_STATUS)).toContain(CURATOR_INVITE_STATUS.PENDING);
    const canonical = readFileSync(join(ROOT, "src/api/write/signing/canonical.ts"), "utf8");
    expect(canonical).toContain("canonBaseClaimCreatorRewards");
    expect(canonical).toContain("canonBaseInviteCurator");
    expect(canonical).not.toContain("canonBaseAnnotate");
    expect(canonical).not.toContain("canonBaseEnableAgent");
  });

  test("does not keep retired query or mutation keys", () => {
    expect(queryKeys).not.toHaveProperty("agents");
    expect(queryKeys).not.toHaveProperty("inviteCode");
    expect(queryKeys).not.toHaveProperty("inviteCodes");
    expect(queryKeys).not.toHaveProperty("referralStats");
    expect(queryKeys).not.toHaveProperty("referralPrecheck");
    expect(queryKeys).not.toHaveProperty("referralSummary");
    expect(queryKeys).not.toHaveProperty("rewardSummary");
    expect(queryKeys).not.toHaveProperty("achievements");
    expect(mutationKeys.follow).not.toHaveProperty("enableAgent");
    expect(mutationKeys).not.toHaveProperty("annotate");
    expect(mutationKeys).not.toHaveProperty("agents");
    expect(mutationKeys).not.toHaveProperty("rewards");
  });

  test("runtime sources do not call retired endpoints", () => {
    const hits: string[] = [];
    for (const file of scanned) {
      if (file.includes(`${join("src", "stores", "persisted-community-post")}`)) continue;
      if (file.includes(`${join("src", "stores", "pending-posts-lifecycle")}`)) continue;
      if (file.includes(`${join("src", "stores", "draft-migration")}`)) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of RETIRED_CALLS) {
        if (text.includes(needle)) hits.push(`${file}:${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("does not require retired registration invite config", () => {
    const types = readFileSync(join(ROOT, "src/api/types.ts"), "utf8");
    expect(types).not.toContain("registration_invite_code_required");
    expect(types).toContain("registration_enabled");
    expect(types).not.toContain("quests_enabled");
    expect(types).toContain("joined_communities");
  });
});
