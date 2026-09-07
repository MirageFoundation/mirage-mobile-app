import { useQuery } from "@tanstack/react-query";

import { getBootstrap } from "../endpoints/bootstrap";
import { queryKeys } from "../query-keys";
import { parseAccountStatusSnapshot } from "@/src/api/cache/account-status-cache";
import { useAuthStore } from "@/src/stores";

export function useAccountStatus(options?: { enabled?: boolean }) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);

  return useQuery({
    queryKey: queryKeys.accountStatus(walletAddress!),
    queryFn: async ({ signal }) => {
      const response = await getBootstrap({ address: walletAddress! }, { signal });
      if (response.daily_quota === undefined || response.renewal_warning === undefined) {
        throw new Error("Account status is temporarily unavailable. Please retry.");
      }
      return parseAccountStatusSnapshot({
        daily_quota: response.daily_quota,
        renewal_warning: response.renewal_warning,
      });
    },
    enabled:
      !!walletAddress &&
      isLoggedIn &&
      !isInitializing &&
      !isBootstrapping &&
      (options?.enabled ?? true),
    staleTime: (query) => query.state.data?.incomplete ? 0 : 1000 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
