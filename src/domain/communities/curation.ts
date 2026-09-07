import { normalizeCommunitySlug } from "./identity";
import type { ServedLens } from "./types";

export const MAX_CURATION_TEAM_NAME_LENGTH = 30;
export const MAX_CURATION_TEAM_DESCRIPTION_LENGTH = 800;
export const MODERATION_BATCH_CAP = 50;
export const HIDDEN_LIST_INITIAL = 10;
export const HIDDEN_LIST_MORE = 50;

export const CURATOR_INVITE_STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  REVOKED: 2,
  DECLINED: 3,
} as const;

export type CuratorInviteStatus =
  (typeof CURATOR_INVITE_STATUS)[keyof typeof CURATOR_INVITE_STATUS];

export const ALLOWED_CURATION_TAGS = [
  "",
  "sensitive",
  "adult",
  "gore",
  "violence",
  "death",
] as const;

export type AllowedCurationTag = (typeof ALLOWED_CURATION_TAGS)[number];

const TEAM_NAME_RE = /^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9 _-]*[A-Za-z0-9])$/;
const POST_ID_RE = /^[0-9a-f]{64}$/;
const ALLOWED_TAG_SET = new Set<string>(ALLOWED_CURATION_TAGS);

export type CurationRole = "owner" | "curator" | "none";

export type CuratorMembership = {
  community: string;
  team_id: number;
  name: string;
};

export type CuratorCommunitiesResponse = {
  communities: string[];
  memberships: CuratorMembership[];
};

export type CurationTeamSummary = {
  team_id: string;
  owner: string;
  name: string;
  description: string;
  subscriber_only: boolean;
  subscriber_count: string;
  deleted: boolean;
  member_count: number;
  tag: string;
};

export type CommunityTeamsResponse = {
  items: CurationTeamSummary[];
  viewer_team_ids: string[];
  next_cursor: null;
  has_more: false;
};

export type CurationTeamMember = {
  address: string;
  accepted_order: string;
  joined_height: number;
  username: string | null;
  effective_paid: boolean;
};

export type CurationTeamDetail = {
  community: string;
  team_id: string;
  owner: string;
  name: string;
  description: string;
  subscriber_only: boolean;
  subscriber_count: string;
  created_height: number;
  created_order: string;
  deleted: boolean;
  tag: string;
  members: CurationTeamMember[];
};

export type CuratorInvitation = {
  community: string;
  team_id: number;
  name: string;
  inviter: string;
  inviter_username: string | null;
  created_height: number;
};

export type CuratorInvitationsResponse = {
  items: CuratorInvitation[];
};

export type TeamInvitation = {
  invitee: string;
  inviter: string;
  status: CuratorInviteStatus;
  created_height: number;
  resolved_height: number | null;
  username: string | null;
};

export type TeamInvitationsResponse = {
  items: TeamInvitation[];
};

export type TeamModerationItem = {
  post_id: string;
  post_hidden: boolean;
  user_hidden: boolean;
  thread_locked: boolean;
  post_tag: string | null;
};

export type TeamModerationResponse = {
  community: string;
  team_id: string;
  items: TeamModerationItem[];
};

export type HiddenUserItem = {
  address: string;
  username: string | null;
};

export type HiddenPostItem = {
  post_id: string;
  title: string | null;
};

export type HiddenListResponse<T> = {
  community: string;
  team_id: string;
  offset: number;
  limit: number;
  has_more: boolean;
  items: T[];
};

export function runeLength(value: string): number {
  return [...String(value ?? "")].length;
}

export function requireTeamId(value: unknown): number {
  const teamId = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(teamId) || teamId <= 0) {
    throw new Error("team_id must be a positive integer");
  }
  return teamId;
}

export function requireCurationTeamName(
  value: string,
  max = MAX_CURATION_TEAM_NAME_LENGTH,
): string {
  const name = String(value ?? "");
  if (!name) throw new Error("team name is required");
  if (name !== name.trim()) {
    throw new Error("team name must not have surrounding whitespace");
  }
  if (runeLength(name) > max) {
    throw new Error(`team name exceeds limit: ${runeLength(name)} > ${max}`);
  }
  if (!TEAM_NAME_RE.test(name)) {
    throw new Error(
      "team name must be printable ASCII letters, digits, spaces, hyphens, or underscores",
    );
  }
  return name;
}

export function requireCurationTeamDescription(
  value: string,
  max = MAX_CURATION_TEAM_DESCRIPTION_LENGTH,
): string {
  const description = String(value ?? "").trim();
  if (runeLength(description) > max) {
    throw new Error(
      `description exceeds limit: ${runeLength(description)} > ${max}`,
    );
  }
  return description;
}

export function requireCurationTag(value: string): AllowedCurationTag {
  const tag = String(value ?? "");
  if (tag === "porn") {
    throw new Error("mobile emits adult, not porn");
  }
  if (!ALLOWED_TAG_SET.has(tag)) {
    throw new Error("invalid tag");
  }
  return tag as AllowedCurationTag;
}

export function requireCurationPostTagFields(input: {
  tag: string;
  clear: boolean;
}): { tag: AllowedCurationTag; clear: boolean } {
  const tag = requireCurationTag(input.tag);
  if (input.clear && tag !== "") {
    throw new Error("nonempty tag cannot be cleared");
  }
  return { tag, clear: input.clear };
}

export function normalizeHexPostId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim().toLowerCase();
  if (!POST_ID_RE.test(id)) return null;
  return id;
}

export function normalizeAddress(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function curationRole(input: {
  owner?: string | null;
  memberAddresses?: readonly string[] | null;
  viewer?: string | null;
}): CurationRole {
  const viewer = normalizeAddress(input.viewer);
  if (!viewer) return "none";
  if (normalizeAddress(input.owner) === viewer) return "owner";
  if ((input.memberAddresses ?? []).some((address) => normalizeAddress(address) === viewer)) {
    return "curator";
  }
  return "none";
}

export type CurationOwnerAction =
  | "profile"
  | "delete"
  | "invite"
  | "revoke"
  | "remove"
  | "transfer"
  | "subscriber_only"
  | "team_tag";

export type CurationModeratorAction =
  | "hide_post"
  | "hide_user"
  | "lock_thread"
  | "set_post_tag";

export function canPerformOwnerAction(role: CurationRole): boolean {
  return role === "owner";
}

export function canPerformModeratorAction(role: CurationRole): boolean {
  return role === "owner" || role === "curator";
}

export function canLeaveTeam(role: CurationRole): boolean {
  return role === "curator";
}

export function assertOwnerCannotLeave(owner: string, viewer: string): void {
  if (normalizeAddress(owner) === normalizeAddress(viewer)) {
    throw new Error("owner cannot leave");
  }
}

export function assertOwnerCannotRemoveSelf(owner: string, target: string): void {
  if (normalizeAddress(owner) === normalizeAddress(target)) {
    throw new Error("owner cannot remove self");
  }
}

export function viewerCuratesServedTeam(input: {
  community?: string | null;
  lens?: ServedLens | null;
  memberships?: readonly CuratorMembership[] | null;
}): boolean {
  const community = normalizeCommunitySlug(input.community);
  const teamId = input.lens?.effective_team_id;
  if (!community || !Number.isSafeInteger(teamId) || !teamId || teamId <= 0) {
    return false;
  }
  return (input.memberships ?? []).some(
    (membership) =>
      normalizeCommunitySlug(membership.community) === community
      && membership.team_id === teamId,
  );
}

export type ModerationBatchGroup = {
  community: string;
  team_id: number;
  post_ids: string[];
};

export type ModerationPostInput = {
  post_id?: string | null;
  id?: string | null;
  community?: string | null;
  lens?: ServedLens | null;
};

export function groupEligibleModerationPosts(input: {
  posts: readonly ModerationPostInput[];
  memberships: readonly CuratorMembership[];
}): ModerationBatchGroup[] {
  const groups = new Map<string, ModerationBatchGroup>();
  const membershipIndex = new Set(
    input.memberships.map(
      (membership) =>
        `${normalizeCommunitySlug(membership.community)}:${membership.team_id}`,
    ),
  );

  for (const post of input.posts) {
    const community = normalizeCommunitySlug(post.community);
    const teamId = post.lens?.effective_team_id;
    const postId = normalizeHexPostId(post.post_id ?? post.id);
    if (!community || !postId) continue;
    if (!Number.isSafeInteger(teamId) || !teamId || teamId <= 0) continue;
    if (!membershipIndex.has(`${community}:${teamId}`)) continue;
    const key = `${community}:${teamId}`;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.post_ids.includes(postId)) existing.post_ids.push(postId);
    } else {
      groups.set(key, { community, team_id: teamId, post_ids: [postId] });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    post_ids: [...new Set(group.post_ids)].sort(),
  }));
}

export function chunkModerationPostIds(
  ids: readonly string[],
  cap = MODERATION_BATCH_CAP,
): string[][] {
  const unique = [
    ...new Set(
      ids
        .map((id) => normalizeHexPostId(id))
        .filter((id): id is string => !!id),
    ),
  ].sort();
  const chunks: string[][] = [];
  for (let index = 0; index < unique.length; index += cap) {
    chunks.push(unique.slice(index, index + cap));
  }
  return chunks;
}
