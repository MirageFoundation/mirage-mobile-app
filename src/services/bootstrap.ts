import * as Sentry from "@sentry/react-native";
import type { QueryClient } from "@tanstack/react-query";

import { getBootstrap, type BootstrapResponse } from "@/src/api/read/endpoints/bootstrap";
import {
  getChainConfig,
  getNodeConfig,
  getSafeApiErrorContext,
} from "@/src/api/read/endpoints/parameters";
import type { RewardSummaryResponse } from "@/src/api/read/endpoints/rewards";
import {
  getInviteCodes,
  getUserBlocked,
  getUserFollowed,
  getUserStatus,
  mergeUserFollowedEnabledAgents,
} from "@/src/api/read/endpoints/users";
import { queryKeys } from "@/src/api/read/query-keys";
import type { NodeConfigResponse, UserFollowedResponse } from "@/src/api/types";
import { walletService } from "@/src/services/wallet-service";
import { hydrateBootstrapViewCache } from "@/src/api/cache/bootstrap-cache";
import {
  getAllowedTagsFromContentTypes,
  usePreferencesStore,
} from "@/src/stores/preferences-store";

type BootstrapSection = keyof BootstrapResponse;

const STARTUP_FEED_LIMIT = 10;

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
    (section) => response[section] == null,
  );

  return {
    hasAddress,
    nullSections,
    hydratedSections: (Object.keys(response) as BootstrapSection[]).filter(
      (section) => response[section] != null,
    ),
    expectedUserSections: hasAddress,
  };
}

export function getStartupBootstrapParams(address?: string) {
  const { selectedContentTypes, adultContentEnabled } =
    usePreferencesStore.getState();
  const allowedTags = getAllowedTagsFromContentTypes(
    selectedContentTypes,
    adultContentEnabled,
  );

  if (!address) return {};

  return {
    address,
    view: "feed:home" as const,
    by: "magic" as const,
    allowed_tags: allowedTags || undefined,
    limit: STARTUP_FEED_LIMIT,
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
  if (response.chain_config) {
    queryClient.setQueryData(queryKeys.config(), response.chain_config);
  }
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
    queryClient.setQueryData<RewardSummaryResponse>(
      queryKeys.rewardSummary(address),
      (cached) => {
        const incoming = response.rewards_summary!;
        if (
          incoming.disabled &&
          incoming.daily_quests.length === 0 &&
          (cached?.daily_quests.length ?? 0) > 0
        ) {
          return cached;
        }
        return incoming;
      },
    );
  }
}

function scheduleBootstrapFallbacks(
  queryClient: QueryClient,
  response: BootstrapResponse,
  address?: string,
) {
  if (!response.chain_config) {
    addBootstrapFallbackBreadcrumb("chain_config", Boolean(address));
    queryClient.prefetchQuery({
      queryKey: queryKeys.config(),
      queryFn: getChainConfig,
      staleTime: 1000 * 60 * 60 * 4,
    });
  }

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
      queryFn: async () => {
        const nodeConfig = await queryClient.ensureQueryData({
          queryKey: queryKeys.nodeConfig(),
          queryFn: getNodeConfig,
          staleTime: 1000 * 60 * 60 * 24,
        }).catch(() => null);
        return getUserFollowed({ address }, { nodeConfig });
      },
    });
  }
  if (!response.user_blocked) {
    addBootstrapFallbackBreadcrumb("user_blocked", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userBlocked(address),
      queryFn: () => getUserBlocked({ address }),
    });
  }
  // Invite codes are feature-gated: when registration_invite_code_required is
  // false the endpoint always returns an empty list, so a null bootstrap
  // section is expected and not worth a request. Only fall back when the
  // feature is explicitly enabled.
  const inviteCodesEnabled =
    (response.node_config ??
      queryClient.getQueryData<NodeConfigResponse>(queryKeys.nodeConfig()))
      ?.registration_invite_code_required === true;
  if (!response.invite_codes && inviteCodesEnabled) {
    addBootstrapFallbackBreadcrumb("invite_codes", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.inviteCodes(address),
      queryFn: async () => {
        const wallet = await walletService.getWallet();
        if (!wallet || wallet.address.toLowerCase() !== address.toLowerCase()) {
          throw new Error("Active wallet changed before invite-code fallback");
        }
        return getInviteCodes(wallet);
      },
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
    let wallet = null;
    if (address) {
      try {
        const candidate = await walletService.getWallet();
        if (candidate?.address.toLowerCase() === address.toLowerCase()) {
          wallet = candidate;
        }
      } catch (error) {
        Sentry.addBreadcrumb({
          category: "bootstrap",
          message: "Bootstrap identity proof unavailable; continuing without invite codes",
          level: "warning",
          data: { error: error instanceof Error ? error.name : "unknown" },
        });
      }
    }
    const params = getStartupBootstrapParams(address);
    const response = await getBootstrap(params, wallet ?? undefined);
    if (!isCurrent()) return null;
    hydrateBootstrapCache(queryClient, response, address);
    hydrateBootstrapViewCache(queryClient, response, params);
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
        (section) => response[section] != null,
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
