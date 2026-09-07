// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  assertOwnerCannotLeave,
  assertOwnerCannotRemoveSelf,
  canLeaveTeam,
  canPerformModeratorAction,
  canPerformOwnerAction,
  curationRole,
  requireCurationPostTagFields,
  requireCurationTag,
  requireCurationTeamName,
  requireTeamId,
  viewerCuratesServedTeam,
} from "../src/domain/communities";

describe("curation role policy", () => {
  test("owner-only vs accepted curator actions", () => {
    expect(curationRole({ owner: "mirage1owner", memberAddresses: ["mirage1owner", "mirage1cur"], viewer: "mirage1owner" })).toBe("owner");
    expect(curationRole({ owner: "mirage1owner", memberAddresses: ["mirage1owner", "mirage1cur"], viewer: "mirage1cur" })).toBe("curator");
    expect(curationRole({ owner: "mirage1owner", memberAddresses: ["mirage1cur"], viewer: "mirage1other" })).toBe("none");
    expect(canPerformOwnerAction("owner")).toBe(true);
    expect(canPerformOwnerAction("curator")).toBe(false);
    expect(canPerformModeratorAction("owner")).toBe(true);
    expect(canPerformModeratorAction("curator")).toBe(true);
    expect(canPerformModeratorAction("none")).toBe(false);
    expect(canLeaveTeam("owner")).toBe(false);
    expect(canLeaveTeam("curator")).toBe(true);
    expect(() => assertOwnerCannotLeave("mirage1owner", "MIRAGE1OWNER")).toThrow();
    expect(() => assertOwnerCannotRemoveSelf("mirage1owner", "mirage1owner")).toThrow();
  });

  test("validates team ids, names, adult tag, and empty vs clear post tags", () => {
    expect(requireTeamId("3")).toBe(3);
    expect(() => requireTeamId(0)).toThrow();
    expect(requireCurationTeamName("Team A")).toBe("Team A");
    expect(() => requireCurationTeamName(" Team")).toThrow();
    expect(requireCurationTag("adult")).toBe("adult");
    expect(() => requireCurationTag("porn")).toThrow();
    expect(requireCurationPostTagFields({ tag: "", clear: false })).toEqual({ tag: "", clear: false });
    expect(requireCurationPostTagFields({ tag: "", clear: true })).toEqual({ tag: "", clear: true });
    expect(() => requireCurationPostTagFields({ tag: "gore", clear: true })).toThrow();
  });

  test("moderation eligibility uses served effective team only", () => {
    const memberships = [{ community: "bitcoin", team_id: 3, name: "Core" }];
    expect(viewerCuratesServedTeam({
      community: "bitcoin",
      lens: { requested: "effective", effective_mode: 0, effective_team_id: 3 },
      memberships,
    })).toBe(true);
    expect(viewerCuratesServedTeam({
      community: "bitcoin",
      lens: { requested: "effective", effective_mode: 0, effective_team_id: 9 },
      memberships,
    })).toBe(false);
  });
});
