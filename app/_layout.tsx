import { RootProvider } from "@/src/providers/root-provider";
import { Stack } from "expo-router";
import { AuthSheet } from "@/src/components/molecules";
import { ThemedStatusBar } from "@/src/components/ui/themed-status-bar";
import { Platform } from "react-native";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://34f3ac8d124f7b5edbbb02ff36ac1a2b@o4510907183595520.ingest.us.sentry.io/4510907185496064',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

export default Sentry.wrap(function RootLayout() {
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