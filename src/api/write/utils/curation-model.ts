import {
  CURATOR_INVITE_STATUS,
  assertOwnerCannotLeave,
  assertOwnerCannotRemoveSelf,
  normalizeAddress,
  normalizeCommunitySlug,
  normalizeHexPostId,
  requireCurationPostTagFields,
  requireCurationTag,
  requireCurationTeamDescription,
  requireCurationTeamName,
  requireTeamId,
  type CommunityTeamsResponse,
  type CuratorInvitationsResponse,
  type CurationTeamDetail,
  type HiddenListResponse,
  type HiddenPostItem,
  type HiddenUserItem,
  type TeamInvitationsResponse,
  type TeamModerationResponse,
} from "@/src/domain/communities";
import type { SettledWriteResult } from "./indexer-settlement";

export type CurationWriteOperation =
  | "create_team"
  | "delete_team"
  | "set_profile"
  | "invite"
  | "revoke"
  | "accept"
  | "decline"
  | "leave"
  | "remove"
  | "transfer"
  | "subscriber_only"
  | "team_tag"
  | "hide_post"
  | "hide_user"
  | "lock_thread"
  | "post_tag";

export type CurationWriteFields = {
  community: string;
  team_id: number;
  name?: string;
  description?: string;
  target?: string;
  new_owner?: string;
  hidden?: boolean;
  locked?: boolean;
  enabled?: boolean;
  tag?: string;
  clear?: boolean;
  root_hash?: string;
  operation: CurationWriteOperation;
  deliveryFallback?: boolean;
};

export type SettledCurationWriteResult<TIndexed = unknown> =
  SettledWriteResult<TIndexed> & CurationWriteFields;

export function requireCurationCommunity(community: string): string {
  const slug = normalizeCommunitySlug(community);
  if (!slug) throw new Error("community required");
  return slug;
}

export function requireCurationTarget(value: string, label = "target"): string {
  const target = normalizeAddress(value);
  if (!target) throw new Error(`${label} required`);
  return target;
}

export function normalizeCreateTeamFields(input: {
  community: string;
  name: string;
  description?: string;
}): { community: string; name: string; description: string } {
  return {
    community: requireCurationCommunity(input.community),
    name: requireCurationTeamName(input.name),
    description: requireCurationTeamDescription(input.description ?? ""),
  };
}

export function normalizeTeamProfileFields(input: {
  community: string;
  teamId: string | number;
  name: string;
  description?: string;
}): { community: string; team_id: number; name: string; description: string } {
  return {
    community: requireCurationCommunity(input.community),
    team_id: requireTeamId(input.teamId),
    name: requireCurationTeamName(input.name),
    description: requireCurationTeamDescription(input.description ?? ""),
  };
}

export function normalizeTeamIdFields(input: {
  community: string;
  teamId: string | number;
}): { community: string; team_id: number } {
  return {
    community: requireCurationCommunity(input.community),
    team_id: requireTeamId(input.teamId),
  };
}

export function normalizeTargetedTeamFields(input: {
  community: string;
  teamId: string | number;
  target: string;
}): { community: string; team_id: number; target: string } {
  return {
    ...normalizeTeamIdFields(input),
    target: requireCurationTarget(input.target),
  };
}

export function normalizeLeaveFields(input: {
  community: string;
  teamId: string | number;
  owner: string;
  viewer: string;
}): { community: string; team_id: number } {
  assertOwnerCannotLeave(input.owner, input.viewer);
  return normalizeTeamIdFields(input);
}

export function normalizeRemoveFields(input: {
  community: string;
  teamId: string | number;
  owner: string;
  target: string;
}): { community: string; team_id: number; target: string } {
  const fields = normalizeTargetedTeamFields(input);
  assertOwnerCannotRemoveSelf(input.owner, fields.target);
  return fields;
}

export function normalizePostTagFields(input: {
  community: string;
  teamId: string | number;
  target: string;
  tag: string;
  clear: boolean;
}): { community: string; team_id: number; target: string; tag: string; clear: boolean } {
  const tagFields = requireCurationPostTagFields({ tag: input.tag, clear: input.clear });
  return {
    ...normalizeTargetedTeamFields(input),
    ...tagFields,
  };
}

export function normalizeTeamTagFields(input: {
  community: string;
  teamId: string | number;
  tag: string;
}): { community: string; team_id: number; tag: string } {
  return {
    ...normalizeTeamIdFields(input),
    tag: requireCurationTag(input.tag),
  };
}

export function matchesCreatedTeam(
  list: CommunityTeamsResponse,
  fields: { owner: string; name: string },
): boolean {
  const owner = normalizeAddress(fields.owner);
  const name = fields.name.trim().toLowerCase();
  return (list.items ?? []).some(
    (team) =>
      !team.deleted
      && normalizeAddress(team.owner) === owner
      && String(team.name ?? "").trim().toLowerCase() === name,
  );
}

export function matchesDeletedTeam(
  list: CommunityTeamsResponse,
  teamId: number,
): boolean {
  return !(list.items ?? []).some(
    (team) => Number(team.team_id) === teamId && !team.deleted,
  );
}

export function matchesTeamProfile(
  detail: CurationTeamDetail,
  fields: { name: string; description: string },
): boolean {
  return detail.name === fields.name && detail.description === fields.description;
}

export function matchesPendingInvite(
  invitations: TeamInvitationsResponse | CuratorInvitationsResponse,
  target: string,
  teamId?: number,
): boolean {
  const invitee = normalizeAddress(target);
  return (invitations.items ?? []).some((item) => {
    const address = normalizeAddress(
      "invitee" in item ? item.invitee : invitee,
    );
    const status = "status" in item ? item.status : CURATOR_INVITE_STATUS.PENDING;
    const itemTeamId = "team_id" in item ? Number(item.team_id) : teamId;
    return (
      address === invitee
      && status === CURATOR_INVITE_STATUS.PENDING
      && (teamId == null || itemTeamId === teamId)
    );
  });
}

export function matchesInviteStatus(
  invitations: TeamInvitationsResponse,
  target: string,
  status: number,
): boolean {
  const invitee = normalizeAddress(target);
  return (invitations.items ?? []).some(
    (item) => normalizeAddress(item.invitee) === invitee && item.status === status,
  );
}

export function matchesMemberPresence(
  detail: CurationTeamDetail,
  address: string,
  present: boolean,
): boolean {
  const target = normalizeAddress(address);
  const found = (detail.members ?? []).some(
    (member) => normalizeAddress(member.address) === target,
  );
  return present ? found : !found;
}

export function matchesTeamOwner(
  detail: CurationTeamDetail,
  owner: string,
): boolean {
  return normalizeAddress(detail.owner) === normalizeAddress(owner);
}

export function matchesSubscriberOnly(
  detail: CurationTeamDetail,
  enabled: boolean,
): boolean {
  return detail.subscriber_only === enabled;
}

export function matchesTeamTag(detail: CurationTeamDetail, tag: string): boolean {
  return String(detail.tag ?? "") === tag;
}

export function matchesHiddenUserPresence(
  list: HiddenListResponse<HiddenUserItem>,
  target: string,
  hidden: boolean,
): boolean {
  const address = normalizeAddress(target);
  const found = (list.items ?? []).some(
    (item) => normalizeAddress(item.address) === address,
  );
  return hidden ? found : !found;
}

export function matchesHiddenPostPresence(
  list: HiddenListResponse<HiddenPostItem>,
  target: string,
  hidden: boolean,
): boolean {
  const postId = normalizeHexPostId(target) ?? String(target).trim().toLowerCase();
  const found = (list.items ?? []).some(
    (item) => String(item.post_id).toLowerCase() === postId,
  );
  return hidden ? found : !found;
}

export function matchesModerationLeaf(
  response: TeamModerationResponse,
  postId: string,
  expected: Partial<Pick<
    { post_hidden: boolean; user_hidden: boolean; thread_locked: boolean; post_tag: string | null },
    "post_hidden" | "user_hidden" | "thread_locked" | "post_tag"
  >>,
): boolean {
  const id = String(postId).toLowerCase();
  const item = (response.items ?? []).find((row) => row.post_id === id);
  if (!item) return false;
  if (expected.post_hidden != null && item.post_hidden !== expected.post_hidden) return false;
  if (expected.user_hidden != null && item.user_hidden !== expected.user_hidden) return false;
  if (expected.thread_locked != null && item.thread_locked !== expected.thread_locked) return false;
  if ("post_tag" in expected && expected.post_tag !== item.post_tag) return false;
  return true;
}
