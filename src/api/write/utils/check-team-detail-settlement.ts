import { getCommunityTeam, getCommunityTeamInvitations, getCommunityTeams } from "@/src/api/read/endpoints/curation";
import { CURATOR_INVITE_STATUS } from "@/src/domain/communities";
import {
  matchesDeletedTeam, matchesInviteStatus, matchesMemberPresence,
  matchesPendingInvite, matchesSubscriberOnly, matchesTeamOwner,
  matchesTeamProfile, matchesTeamTag, type SettledCurationWriteResult,
} from "./curation-model";

export async function checkTeamDetailSettlement(
  result: SettledCurationWriteResult,
  viewer: string,
): Promise<boolean> {
  const params = { slug: result.community, teamId: result.team_id };
  if (result.operation === "delete_team") {
    return matchesDeletedTeam(await getCommunityTeams({ slug: result.community }), result.team_id);
  }
  if (result.operation === "invite" || result.operation === "revoke") {
    const invitations = await getCommunityTeamInvitations({ ...params, viewer });
    return result.operation === "invite"
      ? matchesPendingInvite(invitations, result.target ?? "", result.team_id)
      : matchesInviteStatus(invitations, result.target ?? "", CURATOR_INVITE_STATUS.REVOKED);
  }
  const detail = await getCommunityTeam(params);
  switch (result.operation) {
    case "set_profile":
      return matchesTeamProfile(detail, { name: result.name ?? "", description: result.description ?? "" });
    case "subscriber_only":
      return matchesSubscriberOnly(detail, result.enabled === true);
    case "team_tag":
      return matchesTeamTag(detail, result.tag ?? "");
    case "transfer":
      return matchesTeamOwner(detail, result.new_owner ?? "");
    case "leave":
      return matchesMemberPresence(detail, viewer, false);
    case "remove":
      return matchesMemberPresence(detail, result.target ?? "", false);
    default:
      return false;
  }
}
