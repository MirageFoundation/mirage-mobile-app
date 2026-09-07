import { api } from "@/src/api/client";
import {
  getCommunityTeam,
  getCommunityTeamHiddenPosts,
  getCommunityTeamHiddenUsers,
  getCommunityTeamInvitations,
  getCommunityTeamModeration,
  getCommunityTeams,
} from "@/src/api/read/endpoints/curation";
import { CURATOR_INVITE_STATUS } from "@/src/domain/communities";
import type { MirageWallet } from "@/src/wallet/types";
import { isValidAddress } from "@/src/wallet/address";
import {
  buildSignedEnvelope,
  canonBaseAcceptCuratorInvite,
  canonBaseCreateCurationTeam,
  canonBaseDeclineCuratorInvite,
  canonBaseDeleteCurationTeam,
  canonBaseInviteCurator,
  canonBaseLeaveCurationTeam,
  canonBaseRemoveCurator,
  canonBaseRevokeCuratorInvite,
  canonBaseSetCurationPostHidden,
  canonBaseSetCurationPostTag,
  canonBaseSetCurationSubscriberOnly,
  canonBaseSetCurationTag,
  canonBaseSetCurationTeamProfile,
  canonBaseSetCurationThreadLocked,
  canonBaseSetCurationUserHidden,
  canonBaseTransferCurationTeam,
} from "../signing";
import type { PoWProgressCallback, WriteResponse } from "../signing";
import {
  assertWriteDelivered,
  waitForIndexedCondition,
  type IndexerSettlementResult,
  type WaitForIndexedConditionOptions,
} from "../utils/indexer-settlement";
import { withPowRetry } from "../utils/retry-pow";
import {
  matchesCreatedTeam,
  matchesDeletedTeam,
  matchesHiddenPostPresence,
  matchesHiddenUserPresence,
  matchesInviteStatus,
  matchesMemberPresence,
  matchesModerationLeaf,
  matchesPendingInvite,
  matchesSubscriberOnly,
  matchesTeamOwner,
  matchesTeamProfile,
  matchesTeamTag,
  normalizeCreateTeamFields,
  normalizeLeaveFields,
  normalizePostTagFields,
  normalizeRemoveFields,
  normalizeTargetedTeamFields,
  normalizeTeamIdFields,
  normalizeTeamProfileFields,
  normalizeTeamTagFields,
  requireCurationTarget,
  type CurationWriteFields,
  type CurationWriteOperation,
  type SettledCurationWriteResult,
} from "../utils/curation-model";

export type CurationSettlementTiming = Pick<
  WaitForIndexedConditionOptions<unknown>,
  "now" | "sleep" | "overallTimeoutMs" | "perReadTimeoutMs" | "delays" | "delayCapMs"
> & { signal?: AbortSignal };

async function postCuration<TPayload extends Record<string, unknown>>(
  wallet: MirageWallet,
  path: string,
  baseBuilder: (params: never) => Uint8Array,
  payloadFields: TPayload,
  name: string,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: baseBuilder as never,
      payloadFields,
      onPoWProgress,
    });
    return api.post<WriteResponse>(path, payload);
  }, name);
}

async function settleAfterDelivery<TIndexed>(
  delivery: WriteResponse,
  wait: () => Promise<IndexerSettlementResult<TIndexed>>,
  meta: CurationWriteFields,
): Promise<SettledCurationWriteResult<TIndexed>> {
  assertWriteDelivered(delivery);
  const settlement = await wait();
  return { delivery, settlement, ...meta };
}

function timingParts(timing: CurationSettlementTiming) {
  const { signal, ...waitTiming } = timing;
  return { signal, waitTiming };
}

export async function createCurationTeam(
  wallet: MirageWallet,
  input: { community: string; name: string; description?: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeCreateTeamFields(input);
  return postCuration(
    wallet,
    "/core/create_curation_team",
    canonBaseCreateCurationTeam,
    fields,
    "createCurationTeam",
    onPoWProgress,
  );
}

export async function setCurationTeamProfile(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; name: string; description?: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTeamProfileFields(input);
  return postCuration(
    wallet,
    "/core/set_curation_team_profile",
    canonBaseSetCurationTeamProfile,
    fields,
    "setCurationTeamProfile",
    onPoWProgress,
  );
}

export async function inviteCurator(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTargetedTeamFields(input);
  if (!isValidAddress(fields.target)) throw new Error("Invalid wallet address");
  return postCuration(
    wallet,
    "/core/invite_curator",
    canonBaseInviteCurator,
    fields,
    "inviteCurator",
    onPoWProgress,
  );
}

export async function revokeCuratorInvite(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTargetedTeamFields(input);
  return postCuration(
    wallet,
    "/core/revoke_curator_invite",
    canonBaseRevokeCuratorInvite,
    fields,
    "revokeCuratorInvite",
    onPoWProgress,
  );
}

export async function acceptCuratorInvite(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTeamIdFields(input);
  return postCuration(
    wallet,
    "/core/accept_curator_invite",
    canonBaseAcceptCuratorInvite,
    fields,
    "acceptCuratorInvite",
    onPoWProgress,
  );
}

export async function declineCuratorInvite(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTeamIdFields(input);
  return postCuration(
    wallet,
    "/core/decline_curator_invite",
    canonBaseDeclineCuratorInvite,
    fields,
    "declineCuratorInvite",
    onPoWProgress,
  );
}

export async function leaveCurationTeam(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; owner: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeLeaveFields({
    ...input,
    viewer: wallet.address,
  });
  return postCuration(
    wallet,
    "/core/leave_curation_team",
    canonBaseLeaveCurationTeam,
    fields,
    "leaveCurationTeam",
    onPoWProgress,
  );
}

export async function removeCurator(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; owner: string; target: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeRemoveFields(input);
  return postCuration(
    wallet,
    "/core/remove_curator",
    canonBaseRemoveCurator,
    fields,
    "removeCurator",
    onPoWProgress,
  );
}

export async function transferCurationTeam(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; newOwner: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = {
    ...normalizeTeamIdFields(input),
    new_owner: requireCurationTarget(input.newOwner, "new_owner"),
  };
  return postCuration(
    wallet,
    "/core/transfer_curation_team",
    canonBaseTransferCurationTeam,
    fields,
    "transferCurationTeam",
    onPoWProgress,
  );
}

export async function deleteCurationTeam(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTeamIdFields(input);
  return postCuration(
    wallet,
    "/core/delete_curation_team",
    canonBaseDeleteCurationTeam,
    fields,
    "deleteCurationTeam",
    onPoWProgress,
  );
}

export async function setCurationPostHidden(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string; hidden: boolean },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = { ...normalizeTargetedTeamFields(input), hidden: input.hidden };
  return postCuration(
    wallet,
    "/core/set_curation_post_hidden",
    canonBaseSetCurationPostHidden,
    fields,
    "setCurationPostHidden",
    onPoWProgress,
  );
}

export async function setCurationUserHidden(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string; hidden: boolean },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = { ...normalizeTargetedTeamFields(input), hidden: input.hidden };
  return postCuration(
    wallet,
    "/core/set_curation_user_hidden",
    canonBaseSetCurationUserHidden,
    fields,
    "setCurationUserHidden",
    onPoWProgress,
  );
}

export async function setCurationThreadLocked(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; rootHash: string; locked: boolean },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = {
    ...normalizeTeamIdFields(input),
    root_hash: String(input.rootHash ?? "").trim().toLowerCase(),
    locked: input.locked,
  };
  if (!fields.root_hash) throw new Error("root_hash required");
  return postCuration(
    wallet,
    "/core/set_curation_thread_locked",
    canonBaseSetCurationThreadLocked,
    fields,
    "setCurationThreadLocked",
    onPoWProgress,
  );
}

export async function setCurationSubscriberOnly(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; enabled: boolean },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = { ...normalizeTeamIdFields(input), enabled: input.enabled };
  return postCuration(
    wallet,
    "/core/set_curation_subscriber_only",
    canonBaseSetCurationSubscriberOnly,
    fields,
    "setCurationSubscriberOnly",
    onPoWProgress,
  );
}

export async function setCurationTag(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; tag: string },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizeTeamTagFields(input);
  return postCuration(
    wallet,
    "/core/set_curation_tag",
    canonBaseSetCurationTag,
    fields,
    "setCurationTag",
    onPoWProgress,
  );
}

export async function setCurationPostTag(
  wallet: MirageWallet,
  input: {
    community: string;
    teamId: string | number;
    target: string;
    tag: string;
    clear: boolean;
  },
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const fields = normalizePostTagFields(input);
  return postCuration(
    wallet,
    "/core/set_curation_post_tag",
    canonBaseSetCurationPostTag,
    fields,
    "setCurationPostTag",
    onPoWProgress,
  );
}

function meta(
  operation: CurationWriteOperation,
  fields: Omit<CurationWriteFields, "operation">,
): CurationWriteFields {
  return { operation, ...fields };
}

export async function createCurationTeamSettled(
  wallet: MirageWallet,
  input: { community: string; name: string; description?: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeCreateTeamFields(input);
  const delivery = await createCurationTeam(wallet, fields, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeams({ slug: fields.community }, { signal: readSignal }),
      matches: (list) => matchesCreatedTeam(list, { owner: wallet.address, name: fields.name }),
    }),
    meta("create_team", { community: fields.community, team_id: 0, name: fields.name }),
  );
}

export async function setCurationTeamProfileSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; name: string; description?: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTeamProfileFields(input);
  const delivery = await setCurationTeamProfile(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesTeamProfile(detail, fields),
    }),
    meta("set_profile", fields),
  );
}

export async function inviteCuratorSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTargetedTeamFields(input);
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await inviteCurator(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamInvitations({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
      }, { signal: readSignal }),
      matches: (invitations) => matchesPendingInvite(invitations, fields.target, fields.team_id),
    }),
    meta("invite", fields),
  );
}

export async function revokeCuratorInviteSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTargetedTeamFields(input);
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await revokeCuratorInvite(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamInvitations({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
      }, { signal: readSignal }),
      matches: (invitations) => matchesInviteStatus(
        invitations,
        fields.target,
        CURATOR_INVITE_STATUS.REVOKED,
      ),
    }),
    meta("revoke", fields),
  );
}

export async function acceptCuratorInviteSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTeamIdFields(input);
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await acceptCuratorInvite(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesMemberPresence(detail, viewer, true),
    }),
    meta("accept", fields),
  );
}

export async function declineCuratorInviteSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTeamIdFields(input);
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await declineCuratorInvite(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamInvitations({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
      }, { signal: readSignal }),
      matches: (invitations) => matchesInviteStatus(
        invitations,
        viewer,
        CURATOR_INVITE_STATUS.DECLINED,
      ),
    }),
    meta("decline", fields),
  );
}

export async function leaveCurationTeamSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; owner: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const fields = normalizeLeaveFields({ ...input, viewer });
  const delivery = await leaveCurationTeam(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesMemberPresence(detail, viewer, false),
    }),
    meta("leave", fields),
  );
}

export async function removeCuratorSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; owner: string; target: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeRemoveFields(input);
  const delivery = await removeCurator(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesMemberPresence(detail, fields.target, false),
    }),
    meta("remove", fields),
  );
}

export async function transferCurationTeamSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; newOwner: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = {
    ...normalizeTeamIdFields(input),
    new_owner: requireCurationTarget(input.newOwner, "new_owner"),
  };
  const delivery = await transferCurationTeam(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesTeamOwner(detail, fields.new_owner),
    }),
    meta("transfer", fields),
  );
}

export async function deleteCurationTeamSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTeamIdFields(input);
  const delivery = await deleteCurationTeam(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeams({ slug: fields.community }, { signal: readSignal }),
      matches: (list) => matchesDeletedTeam(list, fields.team_id),
    }),
    meta("delete_team", fields),
  );
}

export async function setCurationSubscriberOnlySettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; enabled: boolean },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = { ...normalizeTeamIdFields(input), enabled: input.enabled };
  const delivery = await setCurationSubscriberOnly(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesSubscriberOnly(detail, fields.enabled),
    }),
    meta("subscriber_only", fields),
  );
}

export async function setCurationTagSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; tag: string },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizeTeamTagFields(input);
  const delivery = await setCurationTag(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeam({ slug: fields.community, teamId: fields.team_id }, { signal: readSignal }),
      matches: (detail) => matchesTeamTag(detail, fields.tag),
    }),
    meta("team_tag", fields),
  );
}

export async function setCurationPostHiddenSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string; hidden: boolean },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = { ...normalizeTargetedTeamFields(input), hidden: input.hidden };
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await setCurationPostHidden(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  if (input.hidden) {
    return settleAfterDelivery(
      delivery,
      () => waitForIndexedCondition({
        ...waitTiming,
        signal,
        read: (readSignal) => getCommunityTeamHiddenPosts({
          slug: fields.community,
          teamId: fields.team_id,
          viewer,
        }, { signal: readSignal }),
        matches: (list) => matchesHiddenPostPresence(list, fields.target, true),
      }),
      meta("hide_post", fields),
    );
  }
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamModeration({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
        postIds: [fields.target],
      }, { signal: readSignal }),
      matches: (response) => matchesModerationLeaf(response, fields.target, { post_hidden: false }),
    }),
    meta("hide_post", fields),
  );
}

export async function setCurationUserHiddenSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; target: string; hidden: boolean },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = { ...normalizeTargetedTeamFields(input), hidden: input.hidden };
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await setCurationUserHidden(wallet, input, onPoWProgress);
  if (!input.hidden) {
    assertWriteDelivered(delivery);
    return {
      delivery,
      settlement: { status: "timeout" },
      deliveryFallback: true,
      ...meta("hide_user", fields),
    };
  }
  const { signal, waitTiming } = timingParts(timing);
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamHiddenUsers({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
      }, { signal: readSignal }),
      matches: (list) => matchesHiddenUserPresence(list, fields.target, true),
    }),
    meta("hide_user", fields),
  );
}

export async function setCurationThreadLockedSettled(
  wallet: MirageWallet,
  input: { community: string; teamId: string | number; rootHash: string; locked: boolean },
  onPoWProgress?: PoWProgressCallback,
  _timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = {
    ...normalizeTeamIdFields(input),
    root_hash: String(input.rootHash ?? "").trim().toLowerCase(),
    locked: input.locked,
  };
  const delivery = await setCurationThreadLocked(wallet, input, onPoWProgress);
  assertWriteDelivered(delivery);
  return {
    delivery,
    settlement: { status: "timeout" },
    deliveryFallback: true,
    ...meta("lock_thread", fields),
  };
}

export async function setCurationPostTagSettled(
  wallet: MirageWallet,
  input: {
    community: string;
    teamId: string | number;
    target: string;
    tag: string;
    clear: boolean;
  },
  onPoWProgress?: PoWProgressCallback,
  timing: CurationSettlementTiming = {},
): Promise<SettledCurationWriteResult> {
  const fields = normalizePostTagFields(input);
  const viewer = requireCurationTarget(wallet.address, "viewer");
  const delivery = await setCurationPostTag(wallet, input, onPoWProgress);
  const { signal, waitTiming } = timingParts(timing);
  const expectedTag = fields.clear ? null : fields.tag;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunityTeamModeration({
        slug: fields.community,
        teamId: fields.team_id,
        viewer,
        postIds: [fields.target],
      }, { signal: readSignal }),
      matches: (response) => matchesModerationLeaf(response, fields.target, { post_tag: expectedTag }),
    }),
    meta("post_tag", fields),
  );
}
