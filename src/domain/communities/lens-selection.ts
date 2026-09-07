import type { LensMode } from "./types";

export const LENS_PICKS_MAX = 20;

const COMMUNITY_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const LENS_MODES = new Set<LensMode>(["effective", "default", "team", "raw"]);
const LENS_PICK_MODES = new Set<LensPick["lens"]>(["default", "raw", "team"]);

export class LensSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LensSelectionError";
  }
}

export type LensScope = "current" | "legacy";

export type NormalizedLensSelection = {
  lens: LensMode;
  team_id: number | null;
  scope: LensScope;
};

export type NormalizeLensSelectionInput = {
  lens?: string | null;
  team_id?: number | string | null;
  scope?: string | null;
};

export type NormalizeLensSelectionContext = {
  community?: string | null;
  allowTeamWithoutCommunity?: boolean;
};

export type LensPick = {
  community: string;
  lens: "default" | "raw" | "team";
  team_id: number | null;
};

export function isValidCommunitySlug(value: string): boolean {
  return COMMUNITY_SLUG_RE.test(value) && !value.includes("--");
}

function reject(message: string): never {
  throw new LensSelectionError(message);
}

function normalizeToken(value: string | null | undefined, fallback: string): string {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
}

function parsePositiveSafeInteger(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return value;
  }
  const trimmed = String(value).trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function hasConcreteCommunity(community: string | null | undefined): boolean {
  const normalized = String(community ?? "").trim().toLowerCase();
  return normalized.length > 0 && normalized !== "all";
}

export function normalizeLensSelection(
  input: NormalizeLensSelectionInput = {},
  context: NormalizeLensSelectionContext = {},
): NormalizedLensSelection {
  const scope = normalizeToken(input.scope, "current");
  if (scope !== "current" && scope !== "legacy") {
    reject("invalid scope");
  }

  const defaultLens = scope === "legacy" ? "raw" : "effective";
  const lens = normalizeToken(input.lens, defaultLens);
  if (!LENS_MODES.has(lens as LensMode)) {
    reject("invalid lens");
  }

  let teamId: number | null = null;
  if (input.team_id != null && input.team_id !== "") {
    teamId = parsePositiveSafeInteger(input.team_id);
    if (teamId == null) reject("invalid team_id");
  }

  if (lens === "team") {
    if (
      teamId == null
      || (!hasConcreteCommunity(context.community) && !context.allowTeamWithoutCommunity)
    ) {
      reject("team lens requires team_id and community");
    }
  } else if (teamId != null) {
    reject("team_id is only valid with team lens");
  }

  if (scope === "legacy" && (lens !== "raw" || teamId != null)) {
    reject("legacy scope requires raw lens");
  }

  return {
    lens: lens as LensMode,
    team_id: teamId,
    scope,
  };
}

function rejectLensPicks(): never {
  reject("invalid lens_picks");
}

export function parseLensPicks(raw: string | null | undefined): LensPick[] {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];

  const picks = new Map<string, LensPick>();
  for (const chunk of trimmed.split(",")) {
    const fields = chunk.trim().split(":");
    if (fields.length !== 2 && fields.length !== 3) rejectLensPicks();

    const community = fields[0].trim().toLowerCase();
    const lens = fields[1].trim().toLowerCase();
    if (!isValidCommunitySlug(community)) rejectLensPicks();
    if (!LENS_PICK_MODES.has(lens as LensPick["lens"])) rejectLensPicks();

    let teamId: number | null = null;
    if (lens === "team") {
      if (fields.length !== 3) rejectLensPicks();
      teamId = parsePositiveSafeInteger(fields[2]);
      if (teamId == null) rejectLensPicks();
    } else if (fields.length !== 2) {
      rejectLensPicks();
    }

    if (picks.has(community)) rejectLensPicks();
    picks.set(community, {
      community,
      lens: lens as LensPick["lens"],
      team_id: teamId,
    });
  }

  if (picks.size > LENS_PICKS_MAX) {
    reject("too many lens_picks");
  }

  return [...picks.values()];
}

function assertLensPick(pick: LensPick): LensPick {
  const community = String(pick.community ?? "").trim().toLowerCase();
  const lens = String(pick.lens ?? "").trim().toLowerCase();
  if (!isValidCommunitySlug(community)) rejectLensPicks();
  if (!LENS_PICK_MODES.has(lens as LensPick["lens"])) rejectLensPicks();

  let teamId: number | null = null;
  if (lens === "team") {
    teamId = parsePositiveSafeInteger(pick.team_id);
    if (teamId == null) rejectLensPicks();
  } else if (pick.team_id != null) {
    rejectLensPicks();
  }

  return {
    community,
    lens: lens as LensPick["lens"],
    team_id: teamId,
  };
}

export function encodeLensPicks(picks: readonly LensPick[]): string {
  if (picks.length === 0) return "";

  const normalized = new Map<string, LensPick>();
  for (const pick of picks) {
    const next = assertLensPick(pick);
    if (normalized.has(next.community)) rejectLensPicks();
    normalized.set(next.community, next);
  }
  if (normalized.size > LENS_PICKS_MAX) {
    reject("too many lens_picks");
  }

  return [...normalized.values()]
    .sort((left, right) => left.community.localeCompare(right.community))
    .map((pick) => (
      pick.lens === "team"
        ? `${pick.community}:team:${pick.team_id}`
        : `${pick.community}:${pick.lens}`
    ))
    .join(",");
}

export function normalizeLensPicks(raw: string | null | undefined): string {
  return encodeLensPicks(parseLensPicks(raw));
}
