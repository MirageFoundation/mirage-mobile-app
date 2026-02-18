import { RootProvider } from "@/src/providers/root-provider";
import { Stack, useNavigationContainerRef } from "expo-router";
import { AuthSheet } from "@/src/components/molecules";
import { ThemedStatusBar } from "@/src/components/ui/themed-status-bar";
import { Platform } from "react-native";
import * as Sentry from '@sentry/react-native';
import { useEffect } from "react";

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: 'https://34f3ac8d124f7b5edbbb02ff36ac1a2b@o4510907183595520.ingest.us.sentry.io/4510907185496064',

  sendDefaultPii: true,

  tracesSampleRate: 0.2,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration(),
    navigationIntegration,
  ],

  enableAutoPerformanceTracing: true,
});

export default Sentry.wrap(function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    if (ref?.current) {
      navigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  return (
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
     </Stack>
      <ThemedStatusBar />
      <AuthSheet />
    </RootProvider>
  );
});
