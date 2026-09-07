// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertCommunityWriteMode,
  mapPersistedLensChoice,
  remapPinnedTeamId,
  requireBlockedCommunityPattern,
  requireSignerTarget,
  resolveJoinWriteFields,
} from "../src/api/write/utils/community-membership-model";
import {
  clearAllLensPicks,
  useLensPicksStore,
} from "../src/stores/lens-picks-store";

function source(rel: string) {
  return readFileSync(join(import.meta.dir, "..", rel), "utf8");
}

afterEach(() => {
  clearAllLensPicks();
});

describe("community write contract", () => {
  test("canonical paths, bodies, and signer target are wired in the endpoint", () => {
    const endpoint = source("src/api/write/endpoints/community-membership.ts");
    expect(endpoint).toContain('"/core/join_community"');
    expect(endpoint).toContain('"/core/leave_community"');
    expect(endpoint).toContain('"/core/block_community"');
    expect(endpoint).toContain('"/core/unblock_community"');
    expect(endpoint).toContain('"/core/set_curation_preference"');
    expect(endpoint).toContain("pinned_team_id: pinnedTeamId");
    expect(endpoint).toContain("requireSignerTarget(wallet.address)");
    expect(endpoint).toContain("requireBlockedCommunityPattern");
    expect(endpoint).not.toContain("/core/follow_topic");
    expect(endpoint).not.toContain("/core/unfollow_topic");
    expect(endpoint).not.toContain("/core/block_topic");
    expect(endpoint).not.toContain("/core/unblock_topic");
    expect(endpoint).toContain("canonBaseSetCommunityPreference");
  });

  test("signed pinnedTeamId is remapped to pinned_team_id in the body", () => {
    expect(
      remapPinnedTeamId(
        {
          pubkey: "pk",
          community: "bitcoin",
          mode: 1,
          pinnedTeamId: 4,
        },
        { community: "bitcoin", mode: 1, pinned_team_id: 4 },
      ),
    ).toEqual({
      pubkey: "pk",
      community: "bitcoin",
      mode: 1,
      pinned_team_id: 4,
    });
  });

  test("block target is the lowercased signer, never empty or community, and preserves wildcards", () => {
    expect(requireSignerTarget("MIRAGE1OWNER")).toBe("mirage1owner");
    expect(() => requireSignerTarget("")).toThrow();
    expect(requireBlockedCommunityPattern("News*")).toBe("news*");
    const target = requireSignerTarget("MIRAGE1OWNER");
    const community = requireBlockedCommunityPattern("News*");
    expect(target).not.toBe("");
    expect(target).not.toBe(community);
  });
});

describe("persisted lens mapping", () => {
  test("maps default/team/raw exactly and rejects invalid combinations", () => {
    expect(mapPersistedLensChoice("Bitcoin", { lens: "default" })).toEqual({
      community: "bitcoin",
      mode: 0,
      pinned_team_id: 0,
    });
    expect(mapPersistedLensChoice("bitcoin", { lens: "team", team_id: 4 })).toEqual({
      community: "bitcoin",
      mode: 1,
      pinned_team_id: 4,
    });
    expect(mapPersistedLensChoice("bitcoin", { lens: "raw" })).toEqual({
      community: "bitcoin",
      mode: 2,
      pinned_team_id: 0,
    });
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "effective" as never })).toThrow();
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "default", team_id: 4 })).toThrow();
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "raw", team_id: 4 })).toThrow();
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "team" })).toThrow();
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "team", team_id: 0 })).toThrow();
    expect(() => mapPersistedLensChoice("bitcoin", { lens: "team", team_id: 1.5 })).toThrow();
    expect(() => assertCommunityWriteMode(1, 0)).toThrow();
    expect(() => assertCommunityWriteMode(0, 3)).toThrow();
  });

  test("explicit join selection wins, then session pick, then default", () => {
    useLensPicksStore.getState().setPick({
      viewer: "mirage1owner",
      community: "bitcoin",
      lens: "raw",
    });
    expect(
      resolveJoinWriteFields({
        community: "bitcoin",
        viewer: "mirage1owner",
        selection: { lens: "team", team_id: 7 },
      }),
    ).toEqual({ community: "bitcoin", mode: 1, pinned_team_id: 7 });
    expect(
      resolveJoinWriteFields({
        community: "bitcoin",
        viewer: "mirage1owner",
      }),
    ).toEqual({ community: "bitcoin", mode: 2, pinned_team_id: 0 });
    expect(
      resolveJoinWriteFields({
        community: "ethereum",
        viewer: "mirage1owner",
      }),
    ).toEqual({ community: "ethereum", mode: 0, pinned_team_id: 0 });
  });
});
