import { RootProvider } from "@/src/providers/root-provider";
import { Stack, useNavigationContainerRef } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { AuthSheet } from "@/src/components/molecules";
import { ForceUpdatePopup } from "@/src/components/molecules/force-update-popup";
import { ThemedStatusBar } from "@/src/components/ui/themed-status-bar";
import { Platform } from "react-native";
import * as Sentry from '@sentry/react-native';
import { useEffect } from "react";
import { getShareScheme } from "@/src/utils/share-scheme";
import { useForceUpdate } from "@/src/hooks/use-force-update";

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'https://34f3ac8d124f7b5edbbb02ff36ac1a2b@o4510907183595520.ingest.us.sentry.io/4510907185496064',

  enabled: !__DEV__,

  sendDefaultPii: true,

  tracesSampleRate: 0.2,

  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration(),
    navigationIntegration,
  ],

  enableAutoPerformanceTracing: true,
});

export default Sentry.wrap(function RootLayout() {
  const ref = useNavigationContainerRef();
  const { reason: forceUpdateReason, remoteVersion, isRequired } = useForceUpdate();
  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  return (
    <ShareIntentProvider options={{ scheme: getShareScheme() || undefined, resetOnBackground: false }}>
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
