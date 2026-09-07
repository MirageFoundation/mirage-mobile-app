import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useState } from "react";

import { LaunchRouteOrchestrator } from "@/src/navigation/launch-route-orchestrator";
import { POST_DETAIL_STACK_GESTURE_OPTIONS } from "@/src/navigation/post-detail-route-policy";
import { ProtectedEntry } from "@/src/navigation/protected-entry";
import { AuthIntentOrchestrator } from "@/src/navigation/auth-intent-orchestrator";

/**
 * The single app Stack. The root layout only mounts providers around a Slot;
 * every screen that needs its own page lives in this Stack (with the tab
 * navigator nested as its first screen), mirroring the
 * Slot (root) -> Stack -> Tabs structure.
 *
 * Share intents are detected at the root, but their navigation dispatches
 * from here (LaunchRouteOrchestrator) so the Stack owning the target screens
 * is guaranteed to be mounted before any route change fires.
 */
export default function AppStackLayout() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  return (
    <>
    <LaunchRouteOrchestrator />
    <AuthIntentOrchestrator isTransitioning={isTransitioning} />
    <Stack
      screenOptions={{ headerShown: false }}
      screenLayout={({ children, route }) => <ProtectedEntry screenName={route.name}>{children}</ProtectedEntry>}
      screenListeners={{
        transitionStart: () => setIsTransitioning(true),
        transitionEnd: () => setIsTransitioning(false),
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="(auth)"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
      {/* Post detail. /p/[id] (public share URLs) is a Redirect alias onto
          this canonical screen — see app/(app)/p/[id].tsx. */}
      <Stack.Screen
        name="post/[id]"
        options={{
          animation: "fade",
          animationDuration: 250,
          ...POST_DETAIL_STACK_GESTURE_OPTIONS,
        }}
      />
      <Stack.Screen
        name="post-media/[id]"
        options={{ animation: "fade", gestureEnabled: false }}
      />
      <Stack.Screen
        name="p/[id]"
        options={{
          animation: "none",
          ...POST_DETAIL_STACK_GESTURE_OPTIONS,
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
        name="c/[slug]/index"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="c/[slug]/teams/index"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="c/[slug]/teams/[teamId]"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="curation-invitations"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="creator-earnings"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="user/[id]"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="communities"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="history"
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
      {/* Settings / account family */}
      <Stack.Screen
        name="change-username"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="view-recovery-phrase"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="subscription"
        options={{
          animation: "slide_from_right",
        }}
      />
      {/* Compose family — rises from the bottom like create/comment flows. */}
      <Stack.Screen
        name="edit-post"
        options={{
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
    </>
  );
}
