import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: "modal",
        animation: "slide_from_bottom",
      }}
    >
      <Stack.Screen name="username" />
      <Stack.Screen name="recovery-phrase" />
      <Stack.Screen name="login" />
    </Stack>
  );
}

