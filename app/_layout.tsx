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
            animation: "slide_from_right",
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            animation: "slide_from_right",
          }}
        />
      </Stack>
      <AuthSheet />
    </RootProvider>
  );
}
