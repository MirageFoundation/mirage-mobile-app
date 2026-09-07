import { normalizeAddress, viewerCuratesServedTeam, type CuratorMembership } from "./curation";
import { normalizeCommunitySlug } from "./identity";
import type { ServedLens } from "./types";

export type ModerationTarget = {
  postId: string;
  authorId: string;
  community?: string | null;
  lens?: ServedLens | null;
  rootHash?: string | null;
};

export function eligibleModerationTeam(
  target: ModerationTarget,
  viewer: string | null | undefined,
  memberships: readonly CuratorMembership[],
) {
  if (!normalizeAddress(viewer) || !normalizeAddress(target.authorId)
    || normalizeAddress(viewer) === normalizeAddress(target.authorId)
    || !viewerCuratesServedTeam({ ...target, memberships })) return undefined;
  return memberships.find((membership) =>
    normalizeCommunitySlug(membership.community) === normalizeCommunitySlug(target.community)
    && membership.team_id === target.lens?.effective_team_id);
}

export function moderationTagLabel(tag: string | null) {
  return tag === null ? "No team override" : tag === "" ? "Explicit empty tag" : tag;
}
