import * as Sentry from "@sentry/react-native";

import { getUserStatus } from "@/src/api/read/endpoints/users";
import { queryKeys } from "@/src/api/read/query-keys";
import type { BootstrapResponse } from "@/src/api/read/endpoints/bootstrap";
import { queryClient } from "@/src/providers/query-provider";
import { getTierName } from "@/src/utils/tiers";
import { primeBootstrap } from "@/src/services/bootstrap";
import { walletService } from "@/src/services/wallet-service";

export type AuthUserStatusSnapshot = {
  hasUsername: boolean;
  userLevel: number;
  username: string | null;
  tier: string;
};

export function addAuthBootstrapBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category: "auth-bootstrap",
    message,
    level: "info",
    data,
  });
}

export function prefetchHomeFeed(address?: string): void {
  addAuthBootstrapBreadcrumb("Home feed startup prefetch skipped", {
    hasAddress: Boolean(address),
  });
}

export async function bootstrapAnonymousStartup(
  isCurrent: () => boolean,
): Promise<void> {
  addAuthBootstrapBreadcrumb("Anonymous startup bootstrap started");
  await primeBootstrap(queryClient, undefined, isCurrent);
  if (!isCurrent()) return;
  addAuthBootstrapBreadcrumb("Anonymous startup bootstrap finished");
  prefetchHomeFeed();
}

export async function bootstrapAuthSession(
  address: string,
  label: string,
  isCurrent: () => boolean,
): Promise<BootstrapResponse | null> {
  addAuthBootstrapBreadcrumb(`${label} bootstrap gating enabled`);
  const bootstrapResponse = await primeBootstrap(queryClient, address, isCurrent);
  if (!isCurrent()) return null;
  addAuthBootstrapBreadcrumb(`${label} bootstrap finished`, {
    usedUserStatusFromBootstrap: Boolean(bootstrapResponse?.user_status),
  });
  prefetchHomeFeed(address);
  return bootstrapResponse;
}

export async function resolveAndCacheAuthUserStatus(
  address: string,
  bootstrapResponse?: BootstrapResponse | null,
  isCurrent: () => boolean = () => true,
): Promise<AuthUserStatusSnapshot | null> {
  const userStatus =
    bootstrapResponse?.user_status ?? (await getUserStatus({ address }));

  if (!isCurrent()) return null;
  queryClient.setQueryData(queryKeys.userStatus(address), userStatus);

  if (userStatus.username) {
    walletService.updateMetadata({ hasUsername: true });
  }

  return {
    hasUsername: !!userStatus.username,
    userLevel: userStatus.user_level,
    username: userStatus.username,
    tier: getTierName(userStatus.user_level),
  };
}

export function startAuthUserStatusBootstrap(
  address: string,
  label: string,
  onStatus: (snapshot: AuthUserStatusSnapshot) => void,
  onDone: () => void,
  isCurrent: () => boolean,
): void {
  bootstrapAuthSession(address, label, isCurrent)
    .then((bootstrapResponse) =>
      resolveAndCacheAuthUserStatus(address, bootstrapResponse, isCurrent),
    )
    .then((snapshot) => {
      if (snapshot && isCurrent()) onStatus(snapshot);
    })
    .catch((error) => {
      if (!isCurrent()) return;
      Sentry.captureException(error, {
        tags: {
          feature: "auth-bootstrap",
          operation: label.toLowerCase().replace(/\s+/g, "-"),
        },
      });
    })
    .finally(() => {
      if (isCurrent()) onDone();
    });
}

export function bootstrapAnonymousAfterLogout(
  onDone: () => void,
  isCurrent: () => boolean,
): void {
  addAuthBootstrapBreadcrumb("Logout anonymous bootstrap gating enabled");
  primeBootstrap(queryClient, undefined, isCurrent)
    .catch((error) => {
      if (!isCurrent()) return;
      Sentry.captureException(error, {
        tags: {
          feature: "auth-bootstrap",
          operation: "logout-anonymous-bootstrap",
        },
      });
    })
    .finally(() => {
      if (!isCurrent()) return;
      addAuthBootstrapBreadcrumb("Logout anonymous bootstrap gating disabled");
      onDone();
    });
}
