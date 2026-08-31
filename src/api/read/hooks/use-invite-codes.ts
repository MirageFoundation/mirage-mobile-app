import { useQuery } from "@tanstack/react-query";
import { getInviteCodes } from "../endpoints/users";
import { queryKeys } from "../query-keys";
import { useAuthStore } from "@/src/stores";
import { useNodeConfig } from "./use-parameters";
import { useWallet } from "@/src/hooks/use-wallet";

/**
 * Invite codes are feature-gated by `node_config.registration_invite_code_required`.
 * While the flag is false (fleet-wide default) the endpoint always returns an
 * empty list, so we make zero requests and let the UI render its empty state.
 * When the flag is on, codes are hydrated from `bootstrap`; this query is the
 * refresh path.
 */
function useInviteCodesFeatureEnabled(): boolean {
  const { data: nodeConfig } = useNodeConfig();
  return nodeConfig?.registration_invite_code_required === true;
}

export function useInviteCodes() {
  const { getWallet } = useWallet();
  const address = useAuthStore((s) => s.user?.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const featureEnabled = useInviteCodesFeatureEnabled();

  return useQuery({
    queryKey: queryKeys.inviteCodes(address ?? ""),
    queryFn: async () => getInviteCodes(await getWallet()),
    enabled:
      !!address &&
      isLoggedIn &&
      !isInitializing &&
      !isBootstrapping &&
      featureEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export function useInviteCodesByAddress(address: string | undefined) {
  const { getWallet } = useWallet();
  const currentAddress = useAuthStore((s) => s.user?.walletAddress);
  const featureEnabled = useInviteCodesFeatureEnabled();
  const isCurrentWallet =
    !!address &&
    !!currentAddress &&
    address.toLowerCase() === currentAddress.toLowerCase();

  return useQuery({
    queryKey: queryKeys.inviteCodes(address ?? ""),
    queryFn: async () => getInviteCodes(await getWallet()),
    enabled: isCurrentWallet && featureEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}
