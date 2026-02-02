import { RootProvider } from "@/src/providers/root-provider";
import { Stack } from "expo-router";
import { AuthSheet } from "@/src/components/molecules";

export default function RootLayout() {
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
           presentation: "fullScreenModal",
        }}
      />
       <Stack.Screen
         name="topic/[id]"
         options={{
           animation: "slide_from_right",
         }}
       />
     </Stack>
      <AuthSheet />
    </RootProvider>
  );
}
