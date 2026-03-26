import React, { memo, useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";

import { getUserStatus } from "@/src/api/read/endpoints/users";
import { queryKeys } from "@/src/api/read/query-keys";
import { useAuthStore } from "@/src/stores";
import { getTierName } from "@/src/utils/tiers";
import { walletService } from "@/src/services/wallet-service";

/**
 * WalletProvider
 *
 * Initializes the wallet on app startup and hydrates auth-related
 * server metadata after local wallet/session recovery.
 */
export const WalletProvider = memo(({ children }: { children: React.ReactNode }) => {
  const queryClient = useQueryClient();
  const initializeWallet = useAuthStore((s) => s.initializeWallet);
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const setUser = useAuthStore((s) => s.setUser);
  const setUserLevel = useAuthStore((s) => s.setUserLevel);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);

  useEffect(() => {
    initializeWallet().catch((error) => {
      console.error("[WalletProvider] Failed to initialize wallet:", error);
      Sentry.captureException(error, {
        tags: {
          feature: "wallet",
          action: "initialize",
        },
      });
    });
  }, [initializeWallet]);

  useEffect(() => {
    if (!isLoggedIn || !walletAddress) return;

    let cancelled = false;

    getUserStatus({ address: walletAddress })
      .then((userStatus) => {
        if (cancelled) return;

        queryClient.setQueryData(queryKeys.userStatus(walletAddress), userStatus);
        setUserLevel(userStatus.user_level);

        if (userStatus.username) {
          walletService.updateMetadata({ hasUsername: true });
          setHasUsername(true);
        }

        setUser({
          id: walletAddress,
          username: userStatus.username,
          walletAddress,
          tier: getTierName(userStatus.user_level),
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[WalletProvider] Failed to fetch user status:", error);
        Sentry.captureException(error, {
          tags: {
            feature: "wallet",
            action: "hydrate-user-status",
          },
          extra: { walletAddress },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isLoggedIn,
    queryClient,
    setHasUsername,
    setUser,
    setUserLevel,
    walletAddress,
  ]);

  return <>{children}</>;
});

WalletProvider.displayName = "WalletProvider";
