import { RootProvider } from "@/src/providers/root-provider";
import { Stack, useNavigationContainerRef } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import ExpoShareIntentModule from "expo-share-intent/build/ExpoShareIntentModule";
import { AuthSheet } from "@/src/components/molecules";
import { ForceUpdatePopup } from "@/src/components/molecules/force-update-popup";
import { ThemedStatusBar } from "@/src/components/ui/themed-status-bar";
import { Platform } from "react-native";
import * as Sentry from '@sentry/react-native';
import { useEffect } from "react";
import { getShareScheme } from "@/src/utils/share-scheme";
import { useForceUpdate } from "@/src/hooks/use-force-update";
import {
  signalRootLayoutReady,
  signalRootLayoutUnmounted,
} from "@/src/services/inbox-notifications";
import { IS_FDROID_BUILD } from "@/src/config/build-flags";

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

function isKnownHandledError(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value?.toLowerCase() ?? '';
  if (
    message.includes('getregistrationinfoasync') ||
    message.includes('keychain access failed') ||
    message.includes('user interaction is not allowed')
  ) {
    return true;
  }
  if (
    message.includes('performhapticsasync') ||
    message.includes('a haptics engine is not available')
  ) {
    return true;
  }
  return false;
}

Sentry.init({
  dsn: IS_FDROID_BUILD
    ? undefined
    : 'https://34f3ac8d124f7b5edbbb02ff36ac1a2b@o4510907183595520.ingest.us.sentry.io/4510907185496064',

  enabled: !__DEV__ && !IS_FDROID_BUILD,

  sendDefaultPii: !IS_FDROID_BUILD,

  tracesSampleRate: IS_FDROID_BUILD ? 0 : 0.2,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: IS_FDROID_BUILD ? 0 : 1,
  integrations: IS_FDROID_BUILD
    ? []
    : [
        Sentry.mobileReplayIntegration(),
        navigationIntegration,
      ],

  enableAutoPerformanceTracing: !IS_FDROID_BUILD,

  beforeSend(event) {
    if (isKnownHandledError(event)) return null;
    return event;
  },
});

function AndroidShareIntentColdStartRefresh() {
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const timer = setTimeout(() => {
      try {
        const result = ExpoShareIntentModule?.getShareIntent("");
        Sentry.addBreadcrumb({
          category: "share-intent",
          message: "Android cold-start share refresh requested",
          data: {
            hasNativeModule: !!ExpoShareIntentModule,
            hasResult: !!result,
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

export default Sentry.wrap(function RootLayout() {
  const ref = useNavigationContainerRef();
  const { reason: forceUpdateReason, remoteVersion, isRequired } = useForceUpdate();
  useEffect(() => {
    signalRootLayoutReady();
    if (!IS_FDROID_BUILD && ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
    return () => signalRootLayoutUnmounted();
  }, [ref]);

  return (
    <ShareIntentProvider options={{ scheme: getShareScheme() || undefined, resetOnBackground: true }}>
    <AndroidShareIntentColdStartRefresh />
    <RootProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(auth)"
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
          }}
        />
        <Stack.Screen
          name="post/[id]"
          options={{
            animation: "fade",
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="search"
          options={{
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="video-editor"
          options={{
            animation: "slide_from_bottom",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="user-following/[id]"
          options={{
            animation: "slide_from_right",
          }}
        />
       <Stack.Screen
         name="blocked-list"
         options={{
           animation: "slide_from_right",
         }}
       />
      <Stack.Screen
        name="comment-compose"
        options={{
          animation: "slide_from_bottom",
          ...(Platform.OS === "android"
            ? { animationDuration: 200 }
            : { presentation: "fullScreenModal" as const }),
        }}
      />
       <Stack.Screen
         name="topic/[id]"
         options={{
           animation: "slide_from_right",
         }}
       />
     <Stack.Screen
       name="saved-posts"
       options={{
         animation: "slide_from_right",
       }}
     />
     <Stack.Screen
       name="delete-account"
       options={{
         animation: "slide_from_right",
       }}
     />
     <Stack.Screen
       name="agents"
       options={{
         animation: "slide_from_right",
       }}
     />
     </Stack>
      <ThemedStatusBar />
      <AuthSheet />
     <ForceUpdatePopup reason={forceUpdateReason} remoteVersion={remoteVersion} isRequired={isRequired} />
    </RootProvider>
    </ShareIntentProvider>
  );
});
