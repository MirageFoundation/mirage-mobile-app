import * as Sentry from "@sentry/react-native";
import type { QueryClient } from "@tanstack/react-query";

import { getBootstrap, type BootstrapResponse } from "@/src/api/read/endpoints/bootstrap";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import {
  getInviteCodes,
  getUserBlocked,
  getUserFollowed,
  getUserStatus,
} from "@/src/api/read/endpoints/users";
import { queryKeys } from "@/src/api/read/query-keys";

export function hydrateBootstrapCache(
  queryClient: QueryClient,
  response: BootstrapResponse,
  address?: string,
) {
  if (response.node_config) {
    queryClient.setQueryData(queryKeys.nodeConfig(), response.node_config);
  }

  if (!address) return;

  if (response.user_status) {
    queryClient.setQueryData(queryKeys.userStatus(address), response.user_status);
  }
  if (response.user_followed) {
    queryClient.setQueryData(queryKeys.userFollowed(address), response.user_followed);
  }
  if (response.user_blocked) {
    queryClient.setQueryData(queryKeys.userBlocked(address), response.user_blocked);
  }
  if (response.invite_codes) {
    queryClient.setQueryData(queryKeys.inviteCodes(address), response.invite_codes);
  }
  if (response.rewards_summary) {
    queryClient.setQueryData(queryKeys.rewardSummary(address), response.rewards_summary);
  }
}

function scheduleBootstrapFallbacks(
  queryClient: QueryClient,
  response: BootstrapResponse,
  address?: string,
) {
  if (!response.node_config) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.nodeConfig(),
      queryFn: () => getNodeConfig(),
      staleTime: 1000 * 60 * 60 * 24,
    });
  }

  if (!address) return;

  if (!response.user_status) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.userStatus(address),
      queryFn: () => getUserStatus({ address }),
    });
  }
  if (!response.user_followed) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.userFollowed(address),
      queryFn: () => getUserFollowed({ address }),
    });
  }
  if (!response.user_blocked) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.userBlocked(address),
      queryFn: () => getUserBlocked({ address }),
    });
  }
  if (!response.invite_codes) {
    queryClient.prefetchQuery({
      queryKey: queryKeys.inviteCodes(address),
      queryFn: () => getInviteCodes({ address }),
    });
  }
}

export async function primeBootstrap(
  queryClient: QueryClient,
  address?: string,
): Promise<BootstrapResponse | null> {
  try {
    const response = await getBootstrap(address ? { address } : undefined);
    hydrateBootstrapCache(queryClient, response, address);
    scheduleBootstrapFallbacks(queryClient, response, address);
    return response;
  } catch (error) {
    console.warn("[Bootstrap] Failed to prime bootstrap cache:", error);
    Sentry.addBreadcrumb({
      category: "bootstrap",
      message: "Bootstrap request failed",
      level: "warning",
      data: { address: address ? "present" : "absent" },
    });
    return null;
  }
}
