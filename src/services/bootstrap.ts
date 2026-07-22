import * as Sentry from "@sentry/react-native";
import type { QueryClient } from "@tanstack/react-query";

import { getBootstrap, type BootstrapResponse } from "@/src/api/read/endpoints/bootstrap";
import { getNodeConfig, getSafeApiErrorContext } from "@/src/api/read/endpoints/parameters";
import {
  getInviteCodes,
  getUserBlocked,
  getUserFollowed,
  getUserStatus,
  mergeUserFollowedEnabledAgents,
} from "@/src/api/read/endpoints/users";
import { queryKeys } from "@/src/api/read/query-keys";
import type { UserFollowedResponse } from "@/src/api/types";

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
    Sentry.addBreadcrumb({
      category: "auto-enabled-agents",
      message: "Bootstrap node config hydrated",
      level: "info",
      data: {
        source: "bootstrap",
        autoEnabledAgentsCount: response.node_config.auto_enabled_agents?.length ?? 0,
        hasAutoEnabledAgents: Array.isArray(response.node_config.auto_enabled_agents),
      },
    });
  }

  if (!address) return;

  if (response.user_status) {
    queryClient.setQueryData(queryKeys.userStatus(address), response.user_status);
  }
  if (response.user_followed) {
    queryClient.setQueryData(
      queryKeys.userFollowed(address),
      mergeUserFollowedEnabledAgents(response.user_followed, {
        source: "bootstrap",
        nodeConfigAutoEnabledAgents: response.node_config?.auto_enabled_agents,
      }),
    );
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
      queryFn: async () => {
        let nodeConfigFetched = false;

        try {
          const nodeConfig = await getNodeConfig();
          nodeConfigFetched = true;
          const autoEnabledAgentsCount = nodeConfig.auto_enabled_agents?.length ?? 0;
          let mergedExistingUserFollowed = false;

          if (address) {
            queryClient.setQueryData<UserFollowedResponse | undefined>(
              queryKeys.userFollowed(address),
              (old) => {
                if (!old) return old;
                mergedExistingUserFollowed = true;
                return mergeUserFollowedEnabledAgents(old, {
                  source: "node_config_fallback",
                  nodeConfigAutoEnabledAgents: nodeConfig.auto_enabled_agents,
                });
              },
            );
          }

          Sentry.addBreadcrumb({
            category: "auto-enabled-agents",
            message: "Bootstrap node config fallback completed",
            level: "info",
            data: {
              source: "node_config_fallback",
              hasAddress: Boolean(address),
              autoEnabledAgentsCount,
              mergedExistingUserFollowed,
            },
          });

          return nodeConfig;
        } catch (error) {
          Sentry.addBreadcrumb({
            category: "auto-enabled-agents",
            message: "Bootstrap node config fallback failed",
            level: "error",
            data: {
              source: "node_config_fallback",
              hasAddress: Boolean(address),
              ...getSafeApiErrorContext(error),
            },
          });
          if (nodeConfigFetched) {
            Sentry.captureException(error, {
              tags: { feature: "auto-enabled-agents", operation: "bootstrap-node-config-merge" },
              extra: { hasAddress: Boolean(address) },
            });
          }
          throw error;
        }
      },
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
  isCurrent: () => boolean = () => true,
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
    if (!isCurrent()) return null;
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
    if (!isCurrent()) return null;
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
