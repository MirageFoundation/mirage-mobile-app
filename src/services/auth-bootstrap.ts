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

export async function bootstrapAnonymousStartup(): Promise<void> {
  addAuthBootstrapBreadcrumb("Anonymous startup bootstrap started");
  await primeBootstrap(queryClient);
  addAuthBootstrapBreadcrumb("Anonymous startup bootstrap finished");
}

export async function bootstrapAuthSession(
  address: string,
  label: string,
): Promise<BootstrapResponse | null> {
  addAuthBootstrapBreadcrumb(`${label} bootstrap gating enabled`);
  const bootstrapResponse = await primeBootstrap(queryClient, address);
  addAuthBootstrapBreadcrumb(`${label} bootstrap finished`, {
    usedUserStatusFromBootstrap: Boolean(bootstrapResponse?.user_status),
  });
  return bootstrapResponse;
}

export async function resolveAndCacheAuthUserStatus(
  address: string,
  bootstrapResponse?: BootstrapResponse | null,
): Promise<AuthUserStatusSnapshot> {
  const userStatus =
    bootstrapResponse?.user_status ?? (await getUserStatus({ address }));

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
): void {
  bootstrapAuthSession(address, label)
    .then((bootstrapResponse) =>
      resolveAndCacheAuthUserStatus(address, bootstrapResponse),
    )
    .then(onStatus)
    .catch((error) => {
      Sentry.captureException(error, {
        tags: {
          feature: "auth-bootstrap",
          operation: label.toLowerCase().replace(/\s+/g, "-"),
        },
      });
    })
    .finally(onDone);
}

export function bootstrapAnonymousAfterLogout(onDone: () => void): void {
  addAuthBootstrapBreadcrumb("Logout anonymous bootstrap gating enabled");
  primeBootstrap(queryClient)
    .catch((error) => {
      Sentry.captureException(error, {
        tags: {
          feature: "auth-bootstrap",
          operation: "logout-anonymous-bootstrap",
        },
      });
    })
    .finally(() => {
      addAuthBootstrapBreadcrumb("Logout anonymous bootstrap gating disabled");
      onDone();
    });
}
