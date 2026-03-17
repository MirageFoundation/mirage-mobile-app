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
import { initPushNotifications } from "@/src/services/push-notifications";

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
    useEffect(() => {
      initInboxNotifications();
      initPushNotifications();
    }, []);

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
