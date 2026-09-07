import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import {
  blockCommunitySettled,
  joinCommunitySettled,
  leaveCommunitySettled,
  setCommunityPreferenceSettled,
  unblockCommunitySettled,
} from "../endpoints/community-membership";
import {
  mapPersistedLensChoice,
  resolveJoinWriteFields,
  type CommunityWriteFields,
  type PersistedLensChoice,
} from "../utils/community-membership-model";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";
import { applyCommunityMembershipSettledEffects } from "../utils/community-settled-effects";

export { applyCommunityMembershipSettledEffects } from "../utils/community-settled-effects";

export interface UseCommunityMembershipOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export type JoinCommunityMutationInput = {
  community: string;
  selection?: PersistedLensChoice;
};

export type ToggleCommunityMembershipInput = JoinCommunityMutationInput & {
  isCurrentlyJoined: boolean;
};

export type SetCommunityPreferenceInput = {
  community: string;
  selection: PersistedLensChoice;
};

export function useJoinCommunity(options: UseCommunityMembershipOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.join(),
    mutationFn: async (input: JoinCommunityMutationInput) => {
      const wallet = await getWallet();
      const fields = resolveJoinWriteFields({
        community: input.community,
        viewer: address ?? wallet.address,
        selection: input.selection,
      });
      return joinCommunitySettled(wallet, fields, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}

export function useLeaveCommunity(options: UseCommunityMembershipOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.leave(),
    mutationFn: async (community: string) => {
      const wallet = await getWallet();
      return leaveCommunitySettled(wallet, community, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}

export function useToggleCommunityMembership(
  options: UseCommunityMembershipOptions = {},
) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.toggle(),
    mutationFn: async (input: ToggleCommunityMembershipInput) => {
      const wallet = await getWallet();
      if (input.isCurrentlyJoined) {
        return leaveCommunitySettled(wallet, input.community, options.onPoWProgress);
      }
      const fields = resolveJoinWriteFields({
        community: input.community,
        viewer: address ?? wallet.address,
        selection: input.selection,
      });
      return joinCommunitySettled(wallet, fields, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}

export function useBlockCommunity(options: UseCommunityMembershipOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.block(),
    mutationFn: async (community: string) => {
      const wallet = await getWallet();
      return blockCommunitySettled(wallet, community, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}

export function useUnblockCommunity(options: UseCommunityMembershipOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.unblock(),
    mutationFn: async (community: string) => {
      const wallet = await getWallet();
      return unblockCommunitySettled(wallet, community, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}

export function useSetCommunityPreference(
  options: UseCommunityMembershipOptions = {},
) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.community.setPreference(),
    mutationFn: async (input: SetCommunityPreferenceInput) => {
      const wallet = await getWallet();
      const fields: CommunityWriteFields = mapPersistedLensChoice(
        input.community,
        input.selection,
      );
      return setCommunityPreferenceSettled(wallet, fields, options.onPoWProgress);
    },
    onSuccess: (result) => {
      applyCommunityMembershipSettledEffects(queryClient, result, address);
    },
  });
}
