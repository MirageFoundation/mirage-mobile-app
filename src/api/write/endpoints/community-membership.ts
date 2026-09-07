import { api } from "@/src/api/client";
import {
  getCommunities,
  getCommunity,
} from "@/src/api/read/endpoints/communities";
import { getUserBlocked } from "@/src/api/read/endpoints/users";
import type { CommunityDetail } from "@/src/domain/communities";
import type { MirageWallet } from "@/src/wallet/types";
import type { UserBlockedResponse } from "@/src/api/types";
import {
  buildSignedEnvelope,
  canonBaseBlockCommunity,
  canonBaseJoinCommunity,
  canonBaseLeaveCommunity,
  canonBaseSetCommunityPreference,
  canonBaseUnblockCommunity,
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
  assertCommunityWriteMode,
  collectJoinedCommunityPages,
  joinedListContains,
  matchesBlockSettlement,
  matchesJoinSettlement,
  matchesLeaveSettlement,
  matchesPreferenceSettlement,
  remapPinnedTeamId,
  requireBlockedCommunityPattern,
  requireCommunity,
  requireSignerTarget,
  type CommunityMembershipOperation,
  type CommunityWriteFields,
  type JoinSettlementState,
  type SettledCommunityWriteResult,
} from "../utils/community-membership-model";

export {
  assertCommunityWriteMode,
  mapPersistedLensChoice,
  matchesBlockSettlement,
  matchesJoinSettlement,
  matchesLeaveSettlement,
  matchesPreferenceSettlement,
  remapPinnedTeamId,
  requireBlockedCommunityPattern,
  requireCommunity,
  requireSignerTarget,
  resolveJoinWriteFields,
  type CommunityMembershipOperation,
  type CommunityWriteFields,
  type JoinSettlementState,
  type PersistedLensChoice,
  type SettledCommunityWriteResult,
} from "../utils/community-membership-model";

export type CommunitySettlementTiming = Pick<
  WaitForIndexedConditionOptions<unknown>,
  "now" | "sleep" | "overallTimeoutMs" | "perReadTimeoutMs" | "delays" | "delayCapMs"
> & {
  signal?: AbortSignal;
};

export async function joinCommunity(
  wallet: MirageWallet,
  fields: CommunityWriteFields,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const community = requireCommunity(fields.community);
  assertCommunityWriteMode(fields.mode, fields.pinned_team_id);
  const mode = fields.mode;
  const pinnedTeamId = fields.pinned_team_id;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseJoinCommunity,
      payloadFields: {
        community,
        mode,
        pinnedTeamId,
      },
      onPoWProgress,
    });
    return api.post<WriteResponse>(
      "/core/join_community",
      remapPinnedTeamId(payload, {
        community,
        mode,
        pinned_team_id: pinnedTeamId,
      }),
    );
  }, "joinCommunity");
}

export async function leaveCommunity(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const community = requireCommunity(communityInput);
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseLeaveCommunity,
      payloadFields: { community },
      onPoWProgress,
    });
    return api.post<WriteResponse>("/core/leave_community", payload);
  }, "leaveCommunity");
}

export async function blockCommunity(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const target = requireSignerTarget(wallet.address);
  const community = requireBlockedCommunityPattern(communityInput);
  if (target === community) {
    throw new Error("signer target required");
  }
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseBlockCommunity,
      payloadFields: { target, community },
      onPoWProgress,
    });
    return api.post<WriteResponse>("/core/block_community", payload);
  }, "blockCommunity");
}

export async function unblockCommunity(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const target = requireSignerTarget(wallet.address);
  const community = requireBlockedCommunityPattern(communityInput);
  if (target === community) {
    throw new Error("signer target required");
  }
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseUnblockCommunity,
      payloadFields: { target, community },
      onPoWProgress,
    });
    return api.post<WriteResponse>("/core/unblock_community", payload);
  }, "unblockCommunity");
}

export async function setCommunityPreference(
  wallet: MirageWallet,
  fields: CommunityWriteFields,
  onPoWProgress?: PoWProgressCallback,
): Promise<WriteResponse> {
  const community = requireCommunity(fields.community);
  assertCommunityWriteMode(fields.mode, fields.pinned_team_id);
  const mode = fields.mode;
  const pinnedTeamId = fields.pinned_team_id;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseSetCommunityPreference,
      payloadFields: {
        community,
        mode,
        pinnedTeamId,
      },
      onPoWProgress,
    });
    return api.post<WriteResponse>(
      "/core/set_curation_preference",
      remapPinnedTeamId(payload, {
        community,
        mode,
        pinned_team_id: pinnedTeamId,
      }),
    );
  }, "setCommunityPreference");
}

export async function pageJoinedCommunities(
  viewer: string,
  signal?: AbortSignal,
): Promise<{ items: { community: string }[]; exhausted: boolean }> {
  const joinedBy = viewer.trim().toLowerCase();
  return collectJoinedCommunityPages(
    (cursor, pageSignal) => getCommunities(
      { joined_by: joinedBy, cursor },
      { signal: pageSignal },
    ),
    signal,
  );
}

export async function readJoinSettlementState(
  viewer: string,
  community: string,
  signal: AbortSignal,
): Promise<JoinSettlementState> {
  const slug = requireCommunity(community);
  const page = await pageJoinedCommunities(viewer, signal);
  const present = joinedListContains(page.items, slug);
  if (!present) {
    return { present: false, exhausted: page.exhausted, detail: null };
  }
  const detail = await getCommunity({ slug, viewer }, { signal });
  return { present: true, exhausted: page.exhausted, detail };
}

export async function readLeaveSettlementState(
  viewer: string,
  signal: AbortSignal,
): Promise<{ items: { community: string }[]; exhausted: boolean }> {
  return pageJoinedCommunities(viewer, signal);
}

async function settleAfterDelivery<TIndexed>(
  delivery: WriteResponse,
  wait: () => Promise<IndexerSettlementResult<TIndexed>>,
  meta: {
    community: string;
    mode: number;
    pinned_team_id: number;
    operation: CommunityMembershipOperation;
  },
): Promise<SettledCommunityWriteResult<TIndexed>> {
  assertWriteDelivered(delivery);
  const settlement = await wait();
  return {
    delivery,
    settlement,
    ...meta,
  };
}

export async function joinCommunitySettled(
  wallet: MirageWallet,
  fields: CommunityWriteFields,
  onPoWProgress?: PoWProgressCallback,
  timing: CommunitySettlementTiming = {},
): Promise<SettledCommunityWriteResult<JoinSettlementState>> {
  const community = requireCommunity(fields.community);
  assertCommunityWriteMode(fields.mode, fields.pinned_team_id);
  const viewer = requireSignerTarget(wallet.address);
  const delivery = await joinCommunity(wallet, fields, onPoWProgress);
  const { signal, ...waitTiming } = timing;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => readJoinSettlementState(viewer, community, readSignal),
      matches: (state) => matchesJoinSettlement(state, fields),
    }),
    {
      community,
      mode: fields.mode,
      pinned_team_id: fields.pinned_team_id,
      operation: "join",
    },
  );
}

export async function leaveCommunitySettled(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
  timing: CommunitySettlementTiming = {},
): Promise<SettledCommunityWriteResult<{ items: { community: string }[]; exhausted: boolean }>> {
  const community = requireCommunity(communityInput);
  const viewer = requireSignerTarget(wallet.address);
  const delivery = await leaveCommunity(wallet, community, onPoWProgress);
  const { signal, ...waitTiming } = timing;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => readLeaveSettlementState(viewer, readSignal),
      matches: (state) => matchesLeaveSettlement(state, community),
    }),
    {
      community,
      mode: 0,
      pinned_team_id: 0,
      operation: "leave",
    },
  );
}

export async function setCommunityPreferenceSettled(
  wallet: MirageWallet,
  fields: CommunityWriteFields,
  onPoWProgress?: PoWProgressCallback,
  timing: CommunitySettlementTiming = {},
): Promise<SettledCommunityWriteResult<CommunityDetail>> {
  const community = requireCommunity(fields.community);
  assertCommunityWriteMode(fields.mode, fields.pinned_team_id);
  const viewer = requireSignerTarget(wallet.address);
  const delivery = await setCommunityPreference(wallet, fields, onPoWProgress);
  const { signal, ...waitTiming } = timing;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getCommunity({ slug: community, viewer }, { signal: readSignal }),
      matches: (detail) => matchesPreferenceSettlement(detail, fields),
    }),
    {
      community,
      mode: fields.mode,
      pinned_team_id: fields.pinned_team_id,
      operation: "preference",
    },
  );
}

export async function blockCommunitySettled(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
  timing: CommunitySettlementTiming = {},
): Promise<SettledCommunityWriteResult<UserBlockedResponse>> {
  const community = requireBlockedCommunityPattern(communityInput);
  const viewer = requireSignerTarget(wallet.address);
  const delivery = await blockCommunity(wallet, community, onPoWProgress);
  const { signal, ...waitTiming } = timing;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getUserBlocked({ address: viewer }, { signal: readSignal }),
      matches: (blocked) => matchesBlockSettlement(blocked, community, true),
    }),
    {
      community,
      mode: 0,
      pinned_team_id: 0,
      operation: "block",
    },
  );
}

export async function unblockCommunitySettled(
  wallet: MirageWallet,
  communityInput: string,
  onPoWProgress?: PoWProgressCallback,
  timing: CommunitySettlementTiming = {},
): Promise<SettledCommunityWriteResult<UserBlockedResponse>> {
  const community = requireBlockedCommunityPattern(communityInput);
  const viewer = requireSignerTarget(wallet.address);
  const delivery = await unblockCommunity(wallet, community, onPoWProgress);
  const { signal, ...waitTiming } = timing;
  return settleAfterDelivery(
    delivery,
    () => waitForIndexedCondition({
      ...waitTiming,
      signal,
      read: (readSignal) => getUserBlocked({ address: viewer }, { signal: readSignal }),
      matches: (blocked) => matchesBlockSettlement(blocked, community, false),
    }),
    {
      community,
      mode: 0,
      pinned_team_id: 0,
      operation: "unblock",
    },
  );
}
