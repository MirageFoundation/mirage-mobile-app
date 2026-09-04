import { Redirect } from "expo-router";

import {
  AUTH_EXIT_ROUTE,
  AUTH_RECOVERY_ROUTE,
  resolveAuthSignupScreenAccess,
} from "@/src/navigation/auth-flow-policy";
import { selectAuthSessionStatus, useAuthStore } from "@/src/stores/auth-store";

import UsernameScreen from "./username-content";

export default function UsernamePage() {
  const sessionStatus = useAuthStore(selectAuthSessionStatus);
  const recoveryPhrase = useAuthStore((s) => s.recoveryPhrase);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const access = resolveAuthSignupScreenAccess({
    screen: "username",
    sessionStatus,
    hasRecoveryPhrase: !!recoveryPhrase,
    isCompletingSignup: false,
    isInitializing,
  });

  if (access === "redirect_home") {
    return <Redirect href={AUTH_EXIT_ROUTE} />;
  }

  if (access === "redirect_recovery_phrase") {
    return <Redirect href={AUTH_RECOVERY_ROUTE} />;
  }

  return <UsernameScreen />;
}
