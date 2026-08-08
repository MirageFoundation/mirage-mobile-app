import { RootProvider } from "@/src/providers/root-provider";
import { Slot, useNavigationContainerRef } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import ExpoShareIntentModule from "expo-share-intent/build/ExpoShareIntentModule";
import { AuthSheet } from "@/src/components/molecules/auth-sheet";
import { ForceUpdatePopup } from "@/src/components/molecules/force-update-popup";
import { ThemedStatusBar } from "@/src/components/ui/themed-status-bar";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import * as Sentry from '@sentry/react-native';
import { useEffect, useRef } from "react";
import { getShareScheme } from "@/src/utils/share-scheme";
import { useForceUpdate } from "@/src/hooks/use-force-update";
import {
  markShareIntentNavigationActive,
  signalRootLayoutReady,
  signalRootLayoutUnmounted,
} from "@/src/services/inbox-notifications";
import { IS_FDROID_BUILD } from "@/src/config/build-flags";
import { persistPendingShareIntent } from "@/src/navigation/pending-launch-intents";
import { navigationIntegration } from "@/src/services/sentry";
import {
  markStartupRootReady,
  markStartupStable,
} from "@/src/services/startup-diagnostics";
import { resetStartupHomeReady } from "@/src/navigation/startup-navigation-readiness";

const ANDROID_EXIT_BACK_PRESS_WINDOW_MS = 2000;
const STARTUP_STABLE_DELAY_MS = 10_000;

function AndroidShareIntentColdStartRefresh() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const timer = setTimeout(() => {
      try {
        const result = ExpoShareIntentModule?.getShareIntent("");
        const pending = persistPendingShareIntent(
          result,
          "android-cold-start-refresh",
        );
        const hasSharePayload = !!pending;
        if (hasSharePayload) {
          markShareIntentNavigationActive("android-cold-start-refresh");
        }
        Sentry.addBreadcrumb({
          category: "share-intent",
          message: "Android cold-start share refresh requested",
          data: {
            hasNativeModule: !!ExpoShareIntentModule,
            hasResult: !!result,
            hasSharePayload,
            resultType: typeof result,
          },
          level: "info",
        });
      } catch (error) {
        Sentry.addBreadcrumb({
          category: "share-intent",
          message: "Android cold-start share refresh failed",
          data: { error: String(error) },
          level: "warning",
        });
        Sentry.captureException(error, {
          tags: { feature: "share-intent", operation: "android-cold-start-refresh" },
        });
      }
    }, 250);

    return () => clearTimeout(timer);
  }, []);

  return null;
}

function useAndroidDoubleBackExitGuard(ref: ReturnType<typeof useNavigationContainerRef>) {
  const lastExitBackPressAtRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (ref.current?.canGoBack()) {
        lastExitBackPressAtRef.current = 0;
        return false;
      }

      const now = Date.now();
      if (now - lastExitBackPressAtRef.current <= ANDROID_EXIT_BACK_PRESS_WINDOW_MS) {
        BackHandler.exitApp();
        return true;
      }

      lastExitBackPressAtRef.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [ref]);
}

/**
 * Root layout: providers and app-wide overlays around a Slot.
 * All screens live in the (app) group's Stack (src/navigation/app-stack-layout),
 * giving the canonical Slot (root) -> Stack -> Tabs structure.
 */
export default Sentry.wrap(function RootLayout() {
  const ref = useNavigationContainerRef();
  const { reason: forceUpdateReason, remoteVersion, isRequired } = useForceUpdate();
  useAndroidDoubleBackExitGuard(ref);

  useEffect(() => {
    markStartupRootReady();
    signalRootLayoutReady();
    const startupStableTimer = setTimeout(
      markStartupStable,
      STARTUP_STABLE_DELAY_MS,
    );
    if (!IS_FDROID_BUILD && ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
    return () => {
      clearTimeout(startupStableTimer);
      resetStartupHomeReady();
      signalRootLayoutUnmounted();
    };
  }, [ref]);

  return (
    <ShareIntentProvider options={{ scheme: getShareScheme() || undefined, resetOnBackground: false }}>
    <AndroidShareIntentColdStartRefresh />
    <RootProvider>
      <Slot />
      <ThemedStatusBar />
      <AuthSheet />
      <ForceUpdatePopup reason={forceUpdateReason} remoteVersion={remoteVersion} isRequired={isRequired} />
    </RootProvider>
    </ShareIntentProvider>
  );
});
