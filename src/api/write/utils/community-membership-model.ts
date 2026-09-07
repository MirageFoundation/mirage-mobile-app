import {
  normalizeCommunitySlug,
  type CommunitiesResponse,
  type CommunityDetail,
} from "@/src/domain/communities";
import { getSessionLensPick } from "@/src/stores/lens-picks-store";
import type { UserBlockedResponse } from "@/src/api/types";
import type { SettledWriteResult } from "./indexer-settlement";

export type PersistedLensChoice = {
  lens: "default" | "team" | "raw";
  team_id?: number | null;
};

export type CommunityWriteFields = {
  community: string;
  mode: 0 | 1 | 2;
  pinned_team_id: number;
};

export type CommunityMembershipOperation =
  | "join"
  | "leave"
  | "preference"
  | "block"
  | "unblock";

export type SettledCommunityWriteResult<TIndexed = unknown> =
  SettledWriteResult<TIndexed> & {
    community: string;
    mode: number;
    pinned_team_id: number;
    operation: CommunityMembershipOperation;
  };

export function requireCommunity(community: string): string {
  const slug = normalizeCommunitySlug(community);
  if (!slug) throw new Error("community required");
  return slug;
}

export function requireBlockedCommunityPattern(community: string): string {
  const pattern = String(community ?? "").trim().toLowerCase();
  if (!pattern) throw new Error("community required");
  return pattern;
}

export function requireSignerTarget(address: string): string {
  const target = String(address ?? "").trim().toLowerCase();
  if (!target) throw new Error("signer target required");
  return target;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function mapPersistedLensChoice(
  community: string,
  choice: PersistedLensChoice,
): CommunityWriteFields {
  const slug = requireCommunity(community);
  const lens = String(choice?.lens ?? "").trim().toLowerCase();
  if (lens === "effective") {
    throw new Error("cannot persist effective lens");
  }
  if (lens === "default") {
    if (choice.team_id != null && choice.team_id !== 0) {
      throw new Error("default lens requires team_id 0");
    }
    return { community: slug, mode: 0, pinned_team_id: 0 };
  }
  if (lens === "raw") {
    if (choice.team_id != null && choice.team_id !== 0) {
      throw new Error("raw lens requires team_id 0");
    }
    return { community: slug, mode: 2, pinned_team_id: 0 };
  }
  if (lens === "team") {
    if (!isPositiveSafeInteger(choice.team_id)) {
      throw new Error("team lens requires a positive team_id");
    }
    return { community: slug, mode: 1, pinned_team_id: choice.team_id };
  }
  throw new Error("invalid lens");
}

export function assertCommunityWriteMode(
  mode: number,
  pinnedTeamId: number,
): asserts mode is 0 | 1 | 2 {
  if (mode !== 0 && mode !== 1 && mode !== 2) {
    throw new Error("invalid curation mode");
  }
  if (mode === 1) {
    if (!isPositiveSafeInteger(pinnedTeamId)) {
      throw new Error("team mode requires a positive team_id");
    }
    return;
  }
  if (pinnedTeamId !== 0) {
    throw new Error(`mode ${mode} requires pinned_team_id 0`);
  }
}

export function resolveJoinWriteFields(input: {
  community: string;
  viewer?: string | null;
  selection?: PersistedLensChoice;
}): CommunityWriteFields {
  if (input.selection) {
    return mapPersistedLensChoice(input.community, input.selection);
  }
  const pick = getSessionLensPick(input.viewer, input.community);
  if (pick) {
    return mapPersistedLensChoice(input.community, {
      lens: pick.lens,
      team_id: pick.team_id,
    });
  }
  return mapPersistedLensChoice(input.community, { lens: "default" });
}

export function remapPinnedTeamId(
  payload: object,
  fields: { community: string; mode?: number; pinned_team_id?: number; target?: string },
): Record<string, unknown> {
  const { pinnedTeamId: _pinnedTeamId, ...rest } = payload as {
    pinnedTeamId?: number;
  } & Record<string, unknown>;
  return {
    ...rest,
    ...fields,
  };
}

export async function collectJoinedCommunityPages(
  fetchPage: (
    cursor?: string,
    signal?: AbortSignal,
  ) => Promise<CommunitiesResponse>,
  signal?: AbortSignal,
): Promise<{ items: { community: string }[]; exhausted: boolean }> {
  const items: { community: string }[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await fetchPage(cursor, signal);
    items.push(...(page.items ?? []));
    if (!page.has_more || !page.next_cursor) {
      return { items, exhausted: true };
    }
    if (seenCursors.has(page.next_cursor)) {
      return { items, exhausted: true };
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

export function joinedListContains(
  items: { community: string }[],
  community: string,
): boolean {
  const slug = normalizeCommunitySlug(community);
  return items.some((item) => normalizeCommunitySlug(item.community) === slug);
}

export type JoinSettlementState = {
  present: boolean;
  exhausted: boolean;
  detail: CommunityDetail | null;
};

export function matchesJoinSettlement(
  state: JoinSettlementState,
  fields: CommunityWriteFields,
): boolean {
  if (!state.present || !state.detail) return false;
  const detail = state.detail;
  if (!detail.viewer_joined) return false;
  if (fields.mode === 0) {
    return detail.stored_mode === 1 || detail.stored_mode === 2;
  }
  if (fields.mode === 1) {
    return (
      detail.stored_mode === 1
      && Number(detail.stored_team_id) === fields.pinned_team_id
    );
  }
  return detail.stored_mode === 2;
}

export function matchesLeaveSettlement(
  state: { items: { community: string }[]; exhausted: boolean },
  community: string,
): boolean {
  return state.exhausted && !joinedListContains(state.items, community);
}

export function matchesPreferenceSettlement(
  detail: CommunityDetail,
  fields: CommunityWriteFields,
): boolean {
  if (!detail.viewer_joined) return false;
  if (detail.stored_mode !== fields.mode) return false;
  if (fields.mode === 1) {
    return Number(detail.stored_team_id) === fields.pinned_team_id;
  }
  return !detail.stored_team_id || Number(detail.stored_team_id) === 0;
}

export function matchesBlockSettlement(
  blocked: UserBlockedResponse,
  community: string,
  shouldContain: boolean,
): boolean {
  const needle = requireBlockedCommunityPattern(community);
  const list = (blocked.blocked_communities ?? []).map((value) =>
    String(value).trim().toLowerCase(),
  );
  const present = list.includes(needle);
  return shouldContain ? present : !present;
}
