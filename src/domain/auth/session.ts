/**
 * Wallet session status.
 *
 * The mnemonic is the session. Everything else is derived:
 *   no key        → guest
 *   pending key   → signup in progress
 *   confirmed key → authenticated
 */
export type AuthSessionStatus = "guest" | "pending_signup" | "authenticated";

export function resolveAuthSessionStatus(state: {
  hasConfirmedSession: boolean;
  hasPendingWallet: boolean;
  walletAddress?: string | null;
}): AuthSessionStatus {
  if (state.hasPendingWallet) return "pending_signup";
  if (state.hasConfirmedSession && state.walletAddress) return "authenticated";
  return "guest";
}

export function isAuthenticatedSession(
  status: AuthSessionStatus,
): status is "authenticated" {
  return status === "authenticated";
}

export function canRunAuthenticatedSideEffects(state: {
  status: AuthSessionStatus;
  isInitializing?: boolean;
  isPowBusy?: boolean;
}): boolean {
  return (
    state.status === "authenticated" &&
    !state.isInitializing &&
    !state.isPowBusy
  );
}

export type PendingWalletStartupAction = "resume" | "wipe" | "none";

export function resolvePendingWalletStartup(metadata: {
  pending?: boolean;
  hasUsername: boolean;
} | null): PendingWalletStartupAction {
  if (!metadata?.pending) return "none";
  return metadata.hasUsername ? "resume" : "wipe";
}
