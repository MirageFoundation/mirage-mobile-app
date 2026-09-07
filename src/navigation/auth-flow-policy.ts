/**
 * Auth / onboarding screen access.
 *
 * The (auth) group is a modal Stack. Signup is username → recovery-phrase.
 * Completing that flow must leave the modal, never land back on username.
 *
 * Session status is derived from the local key:
 *   guest            → username
 *   pending_signup   → recovery-phrase (seed not confirmed yet)
 *   authenticated    → home
 */

import type { AuthSessionStatus } from "@/src/domain/auth/session";
import { canRunAuthenticatedSideEffects } from "@/src/domain/auth/session";

export const AUTH_EXIT_ROUTE = "/" as const;
export const AUTH_USERNAME_ROUTE = "/username" as const;
export const AUTH_RECOVERY_ROUTE = "/recovery-phrase" as const;

export type AuthSignupScreen = "username" | "recovery-phrase";

export type AuthSignupScreenAccess =
  | "show"
  | "redirect_home"
  | "redirect_username"
  | "redirect_recovery_phrase";

export function resolveAuthSignupScreenAccess(state: {
  screen: AuthSignupScreen;
  sessionStatus: AuthSessionStatus;
  hasRecoveryPhrase: boolean;
  hasConfirmedUsername?: boolean;
  isCompletingSignup: boolean;
  isInitializing?: boolean;
}): AuthSignupScreenAccess {
  // Wallet restore is async (mnemonic is not in the persisted auth slice).
  // Hold the current signup screen until that finishes so a process recreate
  // on the 12-word step cannot bounce to username before the phrase is loaded.
  if (state.isInitializing) {
    return "show";
  }

  if (state.sessionStatus === "authenticated" && !state.isCompletingSignup) {
    return "redirect_home";
  }

  if (state.screen === "recovery-phrase") {
    if ((state.sessionStatus === "pending_signup" && state.hasRecoveryPhrase && state.hasConfirmedUsername) || state.isCompletingSignup) {
      return "show";
    }
    return "redirect_username";
  }

  return "show";
}

export function canRequestOsPermissions(state: {
  sessionStatus: AuthSessionStatus;
  isInitializing?: boolean;
  isPowBusy?: boolean;
}): boolean {
  return canRunAuthenticatedSideEffects({
    status: state.sessionStatus,
    isInitializing: state.isInitializing,
    isPowBusy: state.isPowBusy,
  });
}
