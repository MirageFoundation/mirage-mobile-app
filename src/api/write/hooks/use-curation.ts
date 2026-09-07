import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores/auth-store";
import { usePreferencesStore } from "@/src/stores/preferences-store";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";
import { applyCurationSettledEffects } from "../utils/curation-settled-effects";
import {
  acceptCuratorInviteSettled,
  createCurationTeamSettled,
  declineCuratorInviteSettled,
  deleteCurationTeamSettled,
  inviteCuratorSettled,
  leaveCurationTeamSettled,
  removeCuratorSettled,
  revokeCuratorInviteSettled,
  setCurationPostHiddenSettled,
  setCurationPostTagSettled,
  setCurationSubscriberOnlySettled,
  setCurationTagSettled,
  setCurationTeamProfileSettled,
  setCurationThreadLockedSettled,
  setCurationUserHiddenSettled,
  transferCurationTeamSettled,
} from "../endpoints/curation";

export { applyCurationSettledEffects } from "../utils/curation-settled-effects";

export interface UseCurationOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

function useCurationMutation<TInput>(
  mutationKey: readonly unknown[],
  mutateSettled: (
    wallet: Awaited<ReturnType<ReturnType<typeof useWallet>["getWallet"]>>,
    input: TInput,
    onPoWProgress?: (progress: PoWProgress) => void,
  ) => Promise<Parameters<typeof applyCurationSettledEffects>[1]>,
  options: UseCurationOptions = {},
) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();
  const server = usePreferencesStore((state) => state.apiServer);
  const matchesScope = (scope: { address: string | null | undefined; server: string }) =>
    useAuthStore.getState().walletAddress?.toLowerCase() === scope.address?.toLowerCase()
    && usePreferencesStore.getState().apiServer === scope.server;
  return useMutation({
    mutationKey: mutationKey,
    onMutate: () => ({ address, server }),
    mutationFn: async (input: TInput) => {
      if (!matchesScope({ address, server })) throw new Error("Wallet or server changed. Reopen moderation.");
      const wallet = await getWallet();
      if (!matchesScope({ address, server }) || wallet.address.toLowerCase() !== address?.toLowerCase()) {
        throw new Error("Wallet or server changed. Reopen moderation.");
      }
      return mutateSettled(wallet, input, options.onPoWProgress);
    },
    onSuccess: (result, _input, scope) => {
      if (!scope || !matchesScope(scope)) return;
      applyCurationSettledEffects(queryClient, result, scope.address);
    },
  });
}

export function useCreateCurationTeam(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.createTeam(),
    createCurationTeamSettled,
    options,
  );
}

export function useSetCurationTeamProfile(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setTeamProfile(),
    setCurationTeamProfileSettled,
    options,
  );
}

export function useInviteCurator(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.inviteCurator(),
    inviteCuratorSettled,
    options,
  );
}

export function useRevokeCuratorInvite(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.revokeCuratorInvite(),
    revokeCuratorInviteSettled,
    options,
  );
}

export function useAcceptCuratorInvite(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.acceptCuratorInvite(),
    acceptCuratorInviteSettled,
    options,
  );
}

export function useDeclineCuratorInvite(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.declineCuratorInvite(),
    declineCuratorInviteSettled,
    options,
  );
}

export function useLeaveCurationTeam(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.leaveTeam(),
    leaveCurationTeamSettled,
    options,
  );
}

export function useRemoveCurator(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.removeCurator(),
    removeCuratorSettled,
    options,
  );
}

export function useTransferCurationTeam(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.transferTeam(),
    transferCurationTeamSettled,
    options,
  );
}

export function useDeleteCurationTeam(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.deleteTeam(),
    deleteCurationTeamSettled,
    options,
  );
}

export function useSetCurationPostHidden(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setPostHidden(),
    setCurationPostHiddenSettled,
    options,
  );
}

export function useSetCurationUserHidden(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setUserHidden(),
    setCurationUserHiddenSettled,
    options,
  );
}

export function useSetCurationThreadLocked(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setThreadLocked(),
    setCurationThreadLockedSettled,
    options,
  );
}

export function useSetCurationSubscriberOnly(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setSubscriberOnly(),
    setCurationSubscriberOnlySettled,
    options,
  );
}

export function useSetCurationTag(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setTeamTag(),
    setCurationTagSettled,
    options,
  );
}

export function useSetCurationPostTag(options: UseCurationOptions = {}) {
  return useCurationMutation(
    mutationKeys.curation.setPostTag(),
    setCurationPostTagSettled,
    options,
  );
}
