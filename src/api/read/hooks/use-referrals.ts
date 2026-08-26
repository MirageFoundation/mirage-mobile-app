import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import {
  getReferralPrecheck,
  getReferralSummary,
  type GetReferralSummaryParams,
} from "../endpoints/referrals";

export function useReferralPrecheck(username: string | null) {
  return useQuery({
    queryKey: queryKeys.referralPrecheck(username!),
    queryFn: () => getReferralPrecheck({ username: username! }),
    enabled: !!username,
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useReferralSummary(
  params: Partial<GetReferralSummaryParams> & { address?: string }
) {
  const { address, period, month, limit, offset } = params;
  return useQuery({
    queryKey: queryKeys.referralSummary(address!, period, month),
    queryFn: () =>
      getReferralSummary({
        address: address!,
        period,
        month,
        limit,
        offset,
      }),
    enabled: !!address,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });
}
