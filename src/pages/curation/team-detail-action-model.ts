import { CURATOR_INVITE_STATUS, curationRole, normalizeAddress, type CurationTeamDetail, type TeamInvitation } from "@/src/domain/communities";

export type TeamAction = "profile" | "invite" | "audience" | "tag" | "advanced" | "transfer" | "delete" | "leave" | "remove" | "revoke";
export type TeamActionDraft = { name: string; description: string; target: string; enabled: boolean; tag: string; confirmation: string };

export const TEAM_ACTION_TITLES: Record<TeamAction, string> = {
  profile: "Edit team", invite: "Invite curator", audience: "Posting audience",
  tag: "Content tag", advanced: "Advanced actions", transfer: "Transfer ownership",
  delete: "Delete team", leave: "Leave team", remove: "Remove curator", revoke: "Revoke invitation",
};
export const TEAM_ACTION_SUCCESS: Record<Exclude<TeamAction, "advanced">, string> = {
  profile: "Team updated", invite: "Invite sent", audience: "Audience updated",
  tag: "Tag updated", transfer: "Ownership transferred", delete: "Team deleted",
  leave: "Left team", remove: "Curator removed", revoke: "Invite revoked",
};

export function teamActionAllowed(action: TeamAction, detail: CurationTeamDetail | undefined, viewer: string | null) {
  if (!detail || detail.deleted) return false;
  const role = curationRole({ owner: detail.owner, memberAddresses: detail.members.map(m => m.address), viewer });
  return action === "leave" ? role === "curator" : role === "owner";
}

export function teamActionValidation(action: TeamAction, draft: TeamActionDraft, detail: CurationTeamDetail, invitations: TeamInvitation[]): string | null {
  const target = normalizeAddress(draft.target);
  const owner = normalizeAddress(detail.owner);
  const member = detail.members.some(m => normalizeAddress(m.address) === target);
  if (action === "profile" && !draft.name.trim()) return "Team name required";
  if (["invite", "transfer", "remove", "revoke"].includes(action) && !target) return "Curator address required";
  if (["invite", "transfer", "remove"].includes(action) && target === owner) return "Choose another curator";
  if (action === "invite" && member) return "Already a curator";
  if (action === "invite" && invitations.some(i => normalizeAddress(i.invitee) === target && i.status === CURATOR_INVITE_STATUS.PENDING)) return "Invitation already pending";
  if ((action === "transfer" || action === "remove") && !member) return "Choose a team curator";
  if ((action === "transfer" || action === "delete") && draft.confirmation !== detail.name) return "Team name must match";
  return null;
}
