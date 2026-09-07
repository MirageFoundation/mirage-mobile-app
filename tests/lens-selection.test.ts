// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  LENS_PICKS_MAX,
  LensSelectionError,
  encodeLensPicks,
  isValidCommunitySlug,
  normalizeLensPicks,
  normalizeLensSelection,
  parseLensPicks,
} from "../src/domain/communities";

describe("normalizeLensSelection", () => {
  test("applies current/effective defaults and legacy/raw defaults", () => {
    expect(normalizeLensSelection()).toEqual({
      lens: "effective",
      team_id: null,
      scope: "current",
    });
    expect(normalizeLensSelection({ lens: "EFFECTIVE", scope: " CURRENT " })).toEqual({
      lens: "effective",
      team_id: null,
      scope: "current",
    });
    expect(normalizeLensSelection({ scope: "legacy" })).toEqual({
      lens: "raw",
      team_id: null,
      scope: "legacy",
    });
  });

  test("requires a positive safe integer team_id only for team lens", () => {
    expect(normalizeLensSelection(
      { lens: "team", team_id: 3 },
      { community: "bitcoin" },
    )).toEqual({
      lens: "team",
      team_id: 3,
      scope: "current",
    });
    expect(() => normalizeLensSelection(
      { lens: "team", team_id: 3 },
    )).toThrow(LensSelectionError);
    expect(() => normalizeLensSelection(
      { lens: "raw", team_id: 3 },
      { community: "bitcoin" },
    )).toThrow("team_id is only valid with team lens");
    expect(() => normalizeLensSelection(
      { lens: "team", team_id: 0 },
      { community: "bitcoin" },
    )).toThrow("invalid team_id");
  });

  test("does not silently downgrade team lens on aggregated routes", () => {
    expect(() => normalizeLensSelection(
      { lens: "team", team_id: 3 },
      { community: "all" },
    )).toThrow("team lens requires team_id and community");
    expect(() => normalizeLensSelection(
      { lens: "team", team_id: 3 },
    )).toThrow("team lens requires team_id and community");
    expect(normalizeLensSelection(
      { lens: "team", team_id: 3 },
      { allowTeamWithoutCommunity: true },
    )).toEqual({
      lens: "team",
      team_id: 3,
      scope: "current",
    });
  });

  test("legacy requires raw and no team", () => {
    expect(() => normalizeLensSelection({
      scope: "legacy",
      lens: "effective",
    })).toThrow("legacy scope requires raw lens");
    expect(() => normalizeLensSelection({
      scope: "legacy",
      lens: "team",
      team_id: 1,
    }, { community: "bitcoin" })).toThrow("legacy scope requires raw lens");
  });
});

describe("lens_picks parser and encoder", () => {
  test("accepts 20 unique communities and rejects 21", () => {
    const twenty = Array.from({ length: LENS_PICKS_MAX }, (_, index) => (
      `c${index}:raw`
    )).join(",");
    expect(parseLensPicks(twenty)).toHaveLength(20);
    expect(() => parseLensPicks(`${twenty},c20:default`)).toThrow("too many lens_picks");
  });

  test("rejects duplicates, effective, malformed ids, and wrong field counts", () => {
    expect(() => parseLensPicks("Foo:raw,foo:default")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bitcoin:effective")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bitcoin:team:0")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bitcoin:team")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bitcoin:raw:1")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bit--coin:raw")).toThrow("invalid lens_picks");
    expect(() => parseLensPicks("bitcoin:raw,")).toThrow("invalid lens_picks");
  });

  test("normalizes casing/order and never silently truncates", () => {
    expect(normalizeLensPicks(" B:raw , A:Default ")).toBe("a:default,b:raw");
    expect(encodeLensPicks([
      { community: "zeta", lens: "raw", team_id: null },
      { community: "alpha", lens: "team", team_id: 4 },
    ])).toBe("alpha:team:4,zeta:raw");
    expect(encodeLensPicks([])).toBe("");
    expect(() => encodeLensPicks(
      Array.from({ length: 21 }, (_, index) => ({
        community: `c${index}`,
        lens: "raw" as const,
        team_id: null,
      })),
    )).toThrow("too many lens_picks");
  });

  test("validates backend slug grammar", () => {
    expect(isValidCommunitySlug("bitcoin")).toBe(true);
    expect(isValidCommunitySlug("a")).toBe(true);
    expect(isValidCommunitySlug("bit--coin")).toBe(false);
    expect(isValidCommunitySlug("-bitcoin")).toBe(false);
    expect(isValidCommunitySlug("Bitcoin")).toBe(false);
  });
});
