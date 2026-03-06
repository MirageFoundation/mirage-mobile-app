import React, { memo, useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import { useAuthStore } from "@/src/stores";

/**
 * WalletProvider
 *
 * Initializes the wallet on app startup.
 * Checks SecureStore for existing wallet and loads metadata.
 */
export const WalletProvider = memo(({ children }: { children: React.ReactNode }) => {
  const initializeWallet = useAuthStore((s) => s.initializeWallet);

  useEffect(() => {
    // Initialize wallet on mount
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

  return <>{children}</>;
});

WalletProvider.displayName = "WalletProvider";
