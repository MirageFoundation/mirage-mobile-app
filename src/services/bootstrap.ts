import * as Sentry from "@sentry/react-native";
import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/src/api/client";
import { assertReadActive, isCompletedApiRead, isReadCancellation, shouldRetryApiQuery } from "@/src/api/read-retry-policy";
import { fetchAuthUserStatus } from "@/src/api/read/auth-status-query";

import { getBootstrap, type BootstrapResponse } from "@/src/api/read/endpoints/bootstrap";
import {
  getChainConfig,
  getNodeConfig,
} from "@/src/api/read/endpoints/parameters";
import {
  getUserBlocked,
  getUserFollowed,
} from "@/src/api/read/endpoints/users";
import { withSessionLensPicks } from "@/src/api/read/request-params";
import { queryKeys } from "@/src/api/read/query-keys";
import { hydrateAccountStatus, parseAccountStatusSnapshot } from "@/src/api/cache/account-status-cache";
import { hydrateBootstrapViewCache } from "@/src/api/cache/bootstrap-cache";
import {
  getAllowedTagsFromContentTypes,
  usePreferencesStore,
} from "@/src/stores/preferences-store";

type BootstrapSection = keyof BootstrapResponse;

const STARTUP_FEED_LIMIT = 10;
const responseGuards = new WeakMap<BootstrapResponse, () => boolean>();

export function isBootstrapResponseCurrent(response: BootstrapResponse): boolean {
  return responseGuards.get(response)?.() ?? false;
}

const USER_SECTIONS: BootstrapSection[] = [
  "user_status",
  "user_followed",
  "user_blocked",
];

function summarizeBootstrapResponse(
  response: BootstrapResponse,
  hasAddress: boolean,
) {
  const recognizedSections: BootstrapSection[] = [
    "node_config",
    "chain_config",
    "user_status",
    "user_followed",
    "user_blocked",
    "community_preferences",
    "daily_quota",
    "renewal_warning",
    "view",
  ];
  const nullSections = recognizedSections.filter(
    (section) => response[section] == null,
  );

  return {
    hasAddress,
    nullSections,
    hydratedSections: recognizedSections.filter(
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

  if (!address) return withSessionLensPicks({}, address);

  return withSessionLensPicks({
    address,
    view: "feed:home" as const,
    by: "magic" as const,
    allowed_tags: allowedTags || undefined,
    limit: STARTUP_FEED_LIMIT,
  }, address);
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
  }

  if (!address) return;

  if (response.user_status) {
    queryClient.setQueryData(queryKeys.userStatus(address), response.user_status);
  }
  hydrateAccountStatus(
    queryClient,
    address,
    parseAccountStatusSnapshot({
      daily_quota: response.daily_quota,
      renewal_warning: response.renewal_warning,
    }),
  );
  if (response.user_followed) {
    queryClient.setQueryData(
      queryKeys.userFollowed(address),
      response.user_followed,
    );
  }
  if (response.user_blocked) {
    queryClient.setQueryData(queryKeys.userBlocked(address), response.user_blocked);
  }
}

function scheduleBootstrapFallbacks(
  queryClient: QueryClient,
  response: Partial<BootstrapResponse>,
  address?: string,
  isCurrent: () => boolean = () => true,
) {
  const guarded = <T>(request: (options: { signal: AbortSignal }) => Promise<T>) => async ({ signal }: { signal: AbortSignal }) => {
    const check = () => {
      assertReadActive(signal);
      if (!isCurrent()) throw Object.assign(new Error("Inactive bootstrap session"), { code: "ERR_CANCELED" });
    };
    check();
    const result = await request({ signal });
    check();
    return result;
  };
  if (!response.chain_config) {
    addBootstrapFallbackBreadcrumb("chain_config", Boolean(address));
    queryClient.prefetchQuery({
      queryKey: queryKeys.config(),
      queryFn: guarded(getChainConfig),
      retry: shouldRetryApiQuery,
      staleTime: 1000 * 60 * 60 * 4,
    });
  }

  if (!response.node_config) {
    addBootstrapFallbackBreadcrumb("node_config", Boolean(address));
    queryClient.prefetchQuery({
      queryKey: queryKeys.nodeConfig(),
      queryFn: guarded(getNodeConfig),
      retry: shouldRetryApiQuery,
      staleTime: 1000 * 60 * 60 * 24,
    });
  }

  if (!address) return;

  if (!response.user_status) {
    addBootstrapFallbackBreadcrumb("user_status", true);
    void fetchAuthUserStatus(queryClient, address, isCurrent).catch(() => undefined);
  }
  if (!response.user_followed) {
    addBootstrapFallbackBreadcrumb("user_followed", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userFollowed(address),
      queryFn: guarded((options) => getUserFollowed({ address }, options)),
      retry: shouldRetryApiQuery,
    });
  }
  if (!response.user_blocked) {
    addBootstrapFallbackBreadcrumb("user_blocked", true);
    queryClient.prefetchQuery({
      queryKey: queryKeys.userBlocked(address),
      queryFn: guarded((options) => getUserBlocked({ address }, options)),
      retry: shouldRetryApiQuery,
    });
  }
}

export async function primeBootstrap(
  queryClient: QueryClient,
  address?: string,
  isCurrent: () => boolean = () => true,
  options?: { signal?: AbortSignal },
): Promise<BootstrapResponse | null> {
  const hasAddress = Boolean(address);
  const serverContext = apiClient.getCurrentServerContext();
  const isActive = () => isCurrent() && !options?.signal?.aborted &&
    apiClient.getCurrentServerContext().generation === serverContext.generation;

  Sentry.addBreadcrumb({
    category: "bootstrap",
    message: "Bootstrap request started",
    level: "info",
    data: { hasAddress },
  });

  try {
    const params = getStartupBootstrapParams(address);
    if (!isActive()) return null;
    const response = await getBootstrap(params, options);
    if (!isActive()) return null;
    responseGuards.set(response, isActive);
    hydrateBootstrapCache(queryClient, response, address);
    hydrateBootstrapViewCache(queryClient, response, params);
    scheduleBootstrapFallbacks(queryClient, response, address, isActive);

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
    if (!isActive() || isReadCancellation(error)) return null;
    scheduleBootstrapFallbacks(queryClient, {}, address, isActive);
    Sentry.addBreadcrumb({
      category: "bootstrap",
      message: "Bootstrap request failed",
      level: "warning",
      data: { hasAddress },
    });
    if (!isCompletedApiRead(error)) Sentry.captureException(error, {
      tags: { feature: "bootstrap", operation: "prime" },
      extra: { hasAddress },
    });
    return null;
  }
}
