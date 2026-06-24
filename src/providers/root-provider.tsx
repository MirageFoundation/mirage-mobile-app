import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import React, { memo, useEffect, useRef } from "react";
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
import { cleanupInboxNotificationsForLogout, initInboxNotifications } from "@/src/services/inbox-notifications";
import { initPushNotifications, registerPush } from "@/src/services/push-notifications";
import { identifyUser, setAnalyticsTrackingEnabled, trackEvent } from "@/src/services/analytics";
import { initSeenPosts, teardownSeenPosts } from "@/src/services/seen-posts";
import { useAuthStore, usePreferencesStore, useVideoPositionStore } from "@/src/stores";
import { walletService } from "@/src/services/wallet-service";
import {
  flushPendingAuthRoute,
  flushPendingRouteAfterAuth,
} from "@/src/navigation/auth-navigation";
import { startTimeTicking, stopTimeTicking } from "@/src/stores/time-tick-store";
import * as Sentry from "@sentry/react-native";
import { Alert, AppState } from "react-native";

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
    const hadLoggedInSessionRef = useRef(isLoggedIn);
    const appStateRef = useRef(AppState.currentState);

    useEffect(() => {
      initInboxNotifications();
      initPushNotifications();
      initSeenPosts();
      startTimeTicking();

      return () => {
        teardownSeenPosts();
        stopTimeTicking();
      };
    }, []);

    // Analytics: init when consent is granted; one-time opt-in prompt (EU)
    const analyticsConsent = usePreferencesStore((s) => s.analyticsConsent);
    const analyticsConsentAsked = usePreferencesStore(
      (s) => s.analyticsConsentAsked,
    );

    useEffect(() => {
      if (!analyticsConsent) return;
      setAnalyticsTrackingEnabled(true).then(() => {
        const { walletAddress: address, user } = useAuthStore.getState();
        if (address) {
          identifyUser(address, {
            username: user?.username,
            tier: user?.tier,
          });
        }
        trackEvent("app_opened", {
          source: "launch",
          is_logged_in: Boolean(address),
        });
      });
    }, [analyticsConsent]);

    useEffect(() => {
      if (analyticsConsentAsked) return;
      const timer = setTimeout(() => {
        const { setAnalyticsConsent } = usePreferencesStore.getState();
        Alert.alert(
          "Help improve Mirage",
          "Allow anonymous usage analytics? No personal data or wallet contents are collected, and you can change this anytime in Settings.",
          [
            {
              text: "Not now",
              style: "cancel",
              onPress: () => setAnalyticsConsent(false),
            },
            {
              text: "Allow",
              onPress: () => setAnalyticsConsent(true),
            },
          ],
        );
      }, 3000);
      return () => clearTimeout(timer);
    }, [analyticsConsentAsked]);

    useEffect(() => {
      const sub = AppState.addEventListener("change", (nextState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextState;

        if (nextState.match(/inactive|background/)) {
          useVideoPositionStore.getState().clearAll();
        }

        if (
          analyticsConsent &&
          nextState === "active" &&
          previousState.match(/inactive|background/)
        ) {
          const { walletAddress: address } = useAuthStore.getState();
          trackEvent("app_opened", {
            source: "foreground",
            is_logged_in: Boolean(address),
          });
        }
      });
      return () => sub.remove();
    }, [analyticsConsent]);

    const hasSeenAdultPrompt = usePreferencesStore((s) => s.hasSeenAdultPrompt);

    useEffect(() => {
      const timer = setTimeout(() => flushPendingAuthRoute(), 1000);
      return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
      if (!isLoggedIn) return;
      if (!hasSeenAdultPrompt) return;
      const timer = setTimeout(() => flushPendingRouteAfterAuth(), 1000);
      return () => clearTimeout(timer);
    }, [isLoggedIn, hasSeenAdultPrompt]);

    useEffect(() => {
      if (isLoggedIn) {
        hadLoggedInSessionRef.current = true;
        return;
      }
      if (!hadLoggedInSessionRef.current) return;
      hadLoggedInSessionRef.current = false;
      cleanupInboxNotificationsForLogout().catch((error) => {
        console.warn("[RootProvider] Failed to cleanup inbox notifications:", error);
        Sentry.captureException(error, {
          tags: { feature: "inbox-notifications", operation: "root-provider-logout-cleanup" },
        });
      });
    }, [isLoggedIn]);

    useEffect(() => {
      if (!walletAddress) return;

      if (AppState.currentState !== "active") {
        return;
      }

      const timer = setTimeout(() => {
        if (AppState.currentState !== "active") return;

        initInboxNotifications();

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
