import { Stack } from "expo-router";

/**
 * Auth flow. The (auth) group itself is presented as a single modal by the
 * (app) Stack; screens inside it push as regular cards. Declaring
 * `presentation: "modal"` here too would nest modals inside the modal.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="username" />
      <Stack.Screen name="recovery-phrase" />
      <Stack.Screen name="login" />
    </Stack>
  );
}

export const unstable_settings = {
  initialRouteName: "username",
};
