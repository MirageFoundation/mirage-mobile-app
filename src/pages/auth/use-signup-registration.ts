import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { usePreventRemove } from "expo-router/react-navigation";
import { useTransactionProgress } from "@/src/hooks/use-transaction-progress";
import { useAuthStore } from "@/src/stores/auth-store";
import { walletService } from "@/src/services/wallet-service";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { reconcilePendingSignup, registerPendingUsername, SIGNUP_PENDING_MESSAGE } from "@/src/services/signup-registration";
import { trackEvent } from "@/src/services/analytics";
import { useRouter } from "@/src/navigation/guarded-router";

export function useSignupRegistration(username: string, authorize: () => Promise<boolean>) {
  const router = useRouter();
  const txProgress = useTransactionProgress();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  usePreventRemove(isSettingUp, () => {});
  const mounted = useRef(true);
  const locked = useRef(false);
  const navigationStarted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleContinue = useCallback(async () => {
    if (locked.current) return;
    locked.current = true;
    setIsSettingUp(true);
    setCreateError(null);
    let session = authSessionCoordinator.current();
    const current = () => mounted.current && authSessionCoordinator.isCurrent(session);
    try {
      const metadata = walletService.getWalletMetadata();
      const mustCheck = metadata?.pending && metadata.signup?.phase !== "wallet_generated";
      if (!mustCheck) {
        const authorized = await authorize();
        if (!current()) return;
        if (!authorized) throw new Error("Registration must be enabled and this username freshly available. Retry the checks before continuing.");
        if (!metadata) {
          await useAuthStore.getState().createNewWallet();
          session = authSessionCoordinator.current();
        }
        if (!current()) return;
        Keyboard.dismiss();
        txProgress.startTransaction();
        txProgress.setPhase("signing");
        await registerPendingUsername(username, (progress) => {
          if (current()) txProgress.updatePoWProgress(progress);
        });
      } else {
        txProgress.startTransaction();
      }
      if (!current()) return;
      txProgress.setPhase("confirming");
      const confirmedUsername = await reconcilePendingSignup();
      if (!current()) return;
      if (!confirmedUsername || !session.walletAddress) throw new Error(SIGNUP_PENDING_MESSAGE);
      useAuthStore.getState().setHasUsername(true, confirmedUsername, session.walletAddress);
      trackEvent("username_set");
      txProgress.setSuccess(walletService.getWalletMetadata()?.signup?.txHash);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : SIGNUP_PENDING_MESSAGE;
      setCreateError(message);
      txProgress.setError(message);
    } finally {
      locked.current = false;
      if (mounted.current) setIsSettingUp(false);
    }
  }, [authorize, username, txProgress]);

  const handleRecoveryPhraseNavigation = useCallback(() => {
    const metadata = walletService.getWalletMetadata();
    if (!mounted.current || navigationStarted.current || metadata?.signup?.phase !== "confirmed" ||
        !authSessionCoordinator.matches(authSessionCoordinator.current(), metadata.address)) return;
    navigationStarted.current = true;
    txProgress.hideModal();
    router.push({ pathname: "/recovery-phrase", params: { username: metadata.signup.username } });
  }, [router, txProgress]);

  const handleDismissError = useCallback(() => {
    if (!locked.current) txProgress.hideModal();
  }, [txProgress]);

  return {
    txProgress, isSettingUp, createError, setCreateError, handleContinue,
    handleRetry: handleContinue, handleDismissError, handleRecoveryPhraseNavigation,
  };
}
