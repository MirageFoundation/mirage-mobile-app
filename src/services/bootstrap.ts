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

type BootstrapSection = keyof BootstrapResponse;

const USER_SECTIONS: BootstrapSection[] = [
  "user_status",
  "user_followed",
  "user_blocked",
  "invite_codes",
  "rewards_summary",
];

function summarizeBootstrapResponse(
  response: BootstrapResponse,
  hasAddress: boolean,
) {
  const nullSections = (Object.keys(response) as BootstrapSection[]).filter(
    (section) => response[section] === null,
  );

  return {
    hasAddress,
    nullSections,
    hydratedSections: (Object.keys(response) as BootstrapSection[]).filter(
      (section) => response[section] !== null,
    ),
    expectedUserSections: hasAddress,
  };
}

function addBootstrapFallbackBreadcrumb(
  section: BootstrapSection,
  hasAddress: boolean,
) {
  Sentry.addBreadcrumb({
    category: "bootstrap",
    message: "Bootstrap section null; scheduled fallback",
    level: "info",
    data: { section, hasAddress },
  });
}

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
    addBootstrapFallbackBreadcrumb("node_config", Boolean(address));
    queryClient.prefetchQuery({
      queryKey: queryKeys.nodeConfig(),
      queryFn: () => getNodeConfig(),
      staleTime: 1000 * 60 * 60 * 24,
    });
  }

  if (!address) return;

  if (!response.user_status) {
    addBootstrapFallbackBreadcrumb("user_status", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userStatus(address),
      queryFn: () => getUserStatus({ address }),
    });
  }
  if (!response.user_followed) {
    addBootstrapFallbackBreadcrumb("user_followed", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userFollowed(address),
      queryFn: () => getUserFollowed({ address }),
    });
  }
  if (!response.user_blocked) {
    addBootstrapFallbackBreadcrumb("user_blocked", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userBlocked(address),
      queryFn: () => getUserBlocked({ address }),
    });
  }
  if (!response.invite_codes) {
    addBootstrapFallbackBreadcrumb("invite_codes", true);
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
  const hasAddress = Boolean(address);

  Sentry.addBreadcrumb({
    category: "bootstrap",
    message: "Bootstrap request started",
    level: "info",
    data: { hasAddress },
  });

  try {
    const response = await getBootstrap(address ? { address } : undefined);
    hydrateBootstrapCache(queryClient, response, address);
    scheduleBootstrapFallbacks(queryClient, response, address);

    const summary = summarizeBootstrapResponse(response, hasAddress);
    Sentry.addBreadcrumb({
      category: "bootstrap",
      message: "Bootstrap cache hydrated",
      level: summary.nullSections.length > 0 ? "warning" : "info",
      data: summary,
    });

    if (!hasAddress) {
      const unexpectedAnonymousSections = USER_SECTIONS.filter(
        (section) => response[section] !== null,
      );

      if (unexpectedAnonymousSections.length > 0) {
        Sentry.captureMessage("Anonymous bootstrap returned user sections", {
          level: "warning",
          tags: { feature: "bootstrap", operation: "anonymous-shape" },
          extra: { unexpectedAnonymousSections },
        });
      }
    }

    return response;
  } catch (error) {
    console.warn("[Bootstrap] Failed to prime bootstrap cache:", error);
    Sentry.addBreadcrumb({
      category: "bootstrap",
      message: "Bootstrap request failed",
      level: "warning",
      data: { hasAddress },
    });
    Sentry.captureException(error, {
      tags: { feature: "bootstrap", operation: "prime" },
      extra: { hasAddress },
    });
    return null;
  }
}
