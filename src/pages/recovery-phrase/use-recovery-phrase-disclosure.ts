import { walletService } from "@/src/services/wallet-service";
import { authSessionCoordinator, type AuthSessionToken } from "@/src/services/auth-session-coordinator";
import { useAuthStore } from "@/src/stores/auth-store";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect } from "expo-router/react-navigation";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { acquireSecretScreen, clearSecretClipboardIfUnchanged as clearClipboardIfUnchanged } from "@/src/services/secret-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  RecoveryPhraseDisclosurePolicy,
  type DisclosureClearReason,
  type RecoveryPhraseDisclosureSnapshot,
} from "./recovery-phrase-disclosure-policy";

type CaptureProtectionStatus = "checking" | "ready" | "unavailable";

const isAppActive = () => AppState.currentState === "active";

function sanitizedSecurityError(operation: string): Error {
  return new Error(`Recovery phrase security operation failed: ${operation}`);
}

export function useRecoveryPhraseDisclosure() {
  const policyRef = useRef(new RecoveryPhraseDisclosurePolicy());
  const focusedRef = useRef(false);
  const sessionRef = useRef<AuthSessionToken | null>(null);
  const biometricRequestRef = useRef<number | null>(null);
  const resumeRef = useRef<((active: boolean) => void) | null>(null);
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<RecoveryPhraseDisclosureSnapshot>(
    policyRef.current.getSnapshot(),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captureProtection, setCaptureProtection] =
    useState<CaptureProtectionStatus>("checking");
  const [copied, setCopied] = useState(false);

  const syncSnapshot = useCallback(() => {
    setSnapshot(policyRef.current.getSnapshot());
  }, []);

  const clearDisclosure = useCallback(
    (reason: DisclosureClearReason) => {
      policyRef.current.clear(reason);
      biometricRequestRef.current = null;
      resumeRef.current?.(false);
      resumeRef.current = null;
      sessionRef.current = null;
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
      setCopied(false);
      syncSnapshot();
    },
    [syncSnapshot],
  );

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      focusedRef.current = true;
      let release: (() => Promise<void>) | undefined;
      setCaptureProtection("checking");

      const protect = async () => {
        try {
          const cleanup = await acquireSecretScreen();
          if (focused) {
            release = cleanup;
            setCaptureProtection("ready");
          } else {
            await cleanup();
          }
        } catch {
          if (focused) setCaptureProtection("unavailable");
          Sentry.captureException(sanitizedSecurityError("screen-capture-protection"), {
            tags: { feature: "recovery-phrase" },
          });
        }
      };

      void protect();

      return () => {
        focused = false;
        focusedRef.current = false;
        clearDisclosure("blur");
        if (release) void release().catch(() => {});
      };
    }, [clearDisclosure]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        clearDisclosure("background");
      } else if (
        nextState === "inactive" &&
        biometricRequestRef.current === null
      ) {
        clearDisclosure("app-inactive");
      } else if (nextState === "active") {
        resumeRef.current?.(true);
        resumeRef.current = null;
      }
    });
    const unsubscribe = useAuthStore.subscribe(() => {
      if (sessionRef.current && !authSessionCoordinator.isCurrent(sessionRef.current)) {
        clearDisclosure("inactivity");
      }
    });

    return () => {
      subscription.remove();
      unsubscribe();
      clearDisclosure("cleanup");
    };
  }, [clearDisclosure]);

  useEffect(() => {
    if (snapshot.expiresAt === null) return;

    const timeout = setTimeout(() => {
      if (policyRef.current.expire(Date.now())) {
        setCopied(false);
        syncSnapshot();
      }
    }, Math.max(0, snapshot.expiresAt - Date.now()));

    return () => clearTimeout(timeout);
  }, [snapshot.expiresAt, syncSnapshot]);

  const reveal = useCallback(async () => {
    setErrorMessage(null);
    setCopied(false);

    if (!focusedRef.current || !isAppActive()) return;
    const phase = policyRef.current.getSnapshot().phase;
    if (phase === "authenticating" || phase === "exporting") return;
    if (captureProtection !== "ready") {
      setErrorMessage(
        "Screen protection is unavailable. The recovery phrase will remain hidden.",
      );
      return;
    }

    const request = policyRef.current.beginAuthentication();
    const session = authSessionCoordinator.current();
    sessionRef.current = session;
    const isCurrent = () => focusedRef.current &&
      policyRef.current.isCurrent(request) && authSessionCoordinator.isCurrent(session);
    syncSnapshot();

    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!isCurrent() || !isAppActive()) return;
      if (!hasHardware || !isEnrolled) {
        policyRef.current.authenticationFailed(request);
        syncSnapshot();
        setErrorMessage(
          "Set up Face ID, Touch ID, or fingerprint authentication in device settings before viewing your recovery phrase.",
        );
        return;
      }

      biometricRequestRef.current = request;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "View recovery phrase",
        promptSubtitle: "Authenticate to reveal your wallet recovery phrase",
        cancelLabel: "Cancel",
        fallbackLabel: "Use Device Passcode",
        disableDeviceFallback: false,
        biometricsSecurityLevel: "strong",
      });

      if (!isCurrent()) return;
      if (!result.success) {
        policyRef.current.authenticationFailed(request);
        syncSnapshot();
        setErrorMessage(
          "Authentication was not completed. Your recovery phrase remains hidden.",
        );
        return;
      }

      // iOS can resolve Face ID before its inactive -> active event is delivered.
      if (AppState.currentState === "inactive") {
        const active = await new Promise<boolean>((resolve) => { resumeRef.current = resolve; });
        if (!active) return;
      }
      if (!isCurrent() || !isAppActive()) return;
      biometricRequestRef.current = null;

      const exportRequest = policyRef.current.authenticationSucceeded(request);
      if (exportRequest === null) {
        syncSnapshot();
        return;
      }
      syncSnapshot();

      const phrase = await walletService.exportMnemonic();
      if (!isCurrent() || !isAppActive()) return;
      if (!policyRef.current.completeExport(exportRequest, phrase, Date.now())) {
        if (!phrase) {
          policyRef.current.authenticationFailed(exportRequest);
          setErrorMessage("Unable to access the recovery phrase on this device.");
        }
        syncSnapshot();
        return;
      }
      syncSnapshot();
    } catch {
      if (!isCurrent()) return;
      policyRef.current.authenticationFailed(request);
      syncSnapshot();
      setErrorMessage(
        "Device authentication is unavailable. The recovery phrase will remain hidden.",
      );
      Sentry.captureException(sanitizedSecurityError("authenticate-and-export"), {
        tags: { feature: "recovery-phrase" },
      });
    } finally {
      if (biometricRequestRef.current === request) biometricRequestRef.current = null;
    }
  }, [captureProtection, syncSnapshot]);

  const copy = useCallback(async () => {
    const isCurrent = () => focusedRef.current && AppState.currentState === "active" &&
      sessionRef.current !== null && authSessionCoordinator.isCurrent(sessionRef.current);
    const phrase = policyRef.current.getActivePhrase(Date.now());
    if (!phrase || !isCurrent()) {
      clearDisclosure("inactivity");
      setErrorMessage("Authenticate again before copying the recovery phrase.");
      return;
    }

    try {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        phrase,
      );
      if (!isCurrent() || policyRef.current.getActivePhrase(Date.now()) !== phrase) {
        clearDisclosure("inactivity");
        return;
      }
      await Clipboard.setStringAsync(phrase);
      if (
        policyRef.current.getActivePhrase(Date.now()) !== phrase ||
        !isCurrent()
      ) {
        const clipboardValue = await Clipboard.getStringAsync();
        if (clipboardValue === phrase) {
          await Clipboard.setStringAsync("");
        }
        clearDisclosure("inactivity");
        return;
      }
      setCopied(true);
      void clearClipboardIfUnchanged(digest);
      if (copyFeedbackTimeoutRef.current) {
        clearTimeout(copyFeedbackTimeoutRef.current);
      }
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        copyFeedbackTimeoutRef.current = null;
        setCopied(false);
      }, 2_000);
    } catch {
      setErrorMessage("Unable to copy the recovery phrase.");
    }
  }, [clearDisclosure]);

  return {
    snapshot,
    errorMessage,
    captureProtection,
    copied,
    reveal,
    copy,
  };
}
