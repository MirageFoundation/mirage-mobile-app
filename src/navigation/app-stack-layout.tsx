import { Stack } from "expo-router";
import { Platform } from "react-native";

import { LaunchRouteOrchestrator } from "@/src/navigation/launch-route-orchestrator";

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
  return (
    <>
    <LaunchRouteOrchestrator />
    <Stack screenOptions={{ headerShown: false }}>
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
        }}
      />
      <Stack.Screen
        name="p/[id]"
        options={{
          animation: "none",
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
        name="user/[id]"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="topics"
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
      <Stack.Screen
        name="agents"
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
      {/* Rewards family */}
      <Stack.Screen
        name="quests"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="referrals"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="invite-and-earn"
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
      <Stack.Screen
        name="annotate"
        options={{
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
    </>
  );
}
