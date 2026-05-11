import { useQuery } from "@tanstack/react-query";
import { getInviteCodes } from "../endpoints/users";
import { queryKeys } from "../query-keys";
import { useAuthStore } from "@/src/stores";

export function useInviteCodes() {
  const address = useAuthStore((s) => s.user?.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const hasOnboarded = useAuthStore((s) => s.hasOnboarded);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  return useQuery({
    queryKey: queryKeys.inviteCodes(address ?? ""),
    queryFn: () => getInviteCodes({ address: address! }),
    enabled:
      !!address &&
      isLoggedIn &&
      hasOnboarded &&
      !isInitializing &&
      !isBootstrapping,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export function useInviteCodesByAddress(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.inviteCodes(address ?? ""),
    queryFn: () => getInviteCodes({ address: address! }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}
