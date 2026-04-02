import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import React, { memo, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { MenuProvider } from "react-native-popup-menu";

import { ApiServerProvider } from "./api-server-provider";
import { QueryClearProvider } from "./query-clear-provider";
import { QueryProvider } from "./query-provider";
import { ThemeContextProvider } from "./theme-context";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./toast-provider";
import { PowQueueToast } from "@/src/components/ui/pow-queue-toast";
import { NetworkMonitor } from "@/src/components/network-monitor";
import { CloudflareErrorToast } from "@/src/components/cloudflare-error-toast";
import { WalletProvider } from "./wallet-provider";
import { initInboxNotifications } from "@/src/services/inbox-notifications";
import { initPushNotifications, registerPush } from "@/src/services/push-notifications";
import { useAuthStore, usePreferencesStore, useVideoPositionStore } from "@/src/stores";
import { walletService } from "@/src/services/wallet-service";
import { flushPendingRouteAfterAuth } from "@/src/navigation/auth-navigation";
import * as Sentry from "@sentry/react-native";
import { AppState } from "react-native";

const CoreProviders = memo(({ children }: { children: React.ReactNode }) => (
  <ThemeContextProvider>
    <ThemeProvider>{children}</ThemeProvider>
  </ThemeContextProvider>
));
CoreProviders.displayName = "CoreProviders";

const AuthProviders = memo(({ children }: { children: React.ReactNode }) => (
  <QueryProvider>
    <QueryClearProvider>
      <ApiServerProvider>
        <WalletProvider>{children}</WalletProvider>
      </ApiServerProvider>
    </QueryClearProvider>
  </QueryProvider>
));
AuthProviders.displayName = "AuthProviders";

export const RootProvider = memo(
  ({ children }: { children: React.ReactNode }) => {
    const walletAddress = useAuthStore((s) => s.walletAddress);
    const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

    useEffect(() => {
      initInboxNotifications();
      initPushNotifications();
    }, []);

    useEffect(() => {
      const sub = AppState.addEventListener("change", (nextState) => {
        if (nextState.match(/inactive|background/)) {
          useVideoPositionStore.getState().clearAll();
        }
      });
      return () => sub.remove();
    }, []);

    const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);

    useEffect(() => {
      if (!isLoggedIn) return;
      if (!hasSeenAdultPrompt) return;
      const timer = setTimeout(() => flushPendingRouteAfterAuth(), 1000);
      return () => clearTimeout(timer);
    }, [isLoggedIn, hasSeenAdultPrompt]);

    useEffect(() => {
      if (!walletAddress) return;

      if (AppState.currentState !== "active") {
        return;
      }

      const timer = setTimeout(() => {
        if (AppState.currentState !== "active") return;

        walletService.getWallet()
          .then((wallet) => {
            if (!wallet) return;
            return registerPush(wallet);
          })
          .catch((error) => {
            console.error("[RootProvider] Failed to register push after login:", error);
            Sentry.captureException(error, {
              tags: { feature: "push-notifications", operation: "root-provider-register" },
            });
          });
      }, 2_000);

      return () => clearTimeout(timer);
    }, [walletAddress]);

    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MenuProvider>
        <CoreProviders>
          <KeyboardProvider>
            <AuthProviders>
              <ToastProvider>
                <PowQueueToast />
               <NetworkMonitor />
               <CloudflareErrorToast />
                <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
              </ToastProvider>
            </AuthProviders>
            </KeyboardProvider>
          </CoreProviders>
        </MenuProvider>
      </GestureHandlerRootView>
    );
  }
);
RootProvider.displayName = "RootProvider";
