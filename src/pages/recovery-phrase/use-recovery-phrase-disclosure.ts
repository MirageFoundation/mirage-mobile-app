import { walletService } from "@/src/services/wallet-service";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as ScreenCapture from "expo-screen-capture";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import {
  RecoveryPhraseDisclosurePolicy,
  type DisclosureClearReason,
  type RecoveryPhraseDisclosureSnapshot,
} from "./recovery-phrase-disclosure-policy";

const SCREEN_CAPTURE_KEY = "recovery-phrase";
const CLIPBOARD_CLEAR_TIMEOUT_MS = 30_000;

type CaptureProtectionStatus = "checking" | "ready" | "unavailable";

function sanitizedSecurityError(operation: string): Error {
  return new Error(`Recovery phrase security operation failed: ${operation}`);
}

async function clearClipboardIfUnchanged(expectedDigest: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, CLIPBOARD_CLEAR_TIMEOUT_MS));
  try {
    const clipboardValue = await Clipboard.getStringAsync();
    const clipboardDigest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      clipboardValue,
    );
    if (clipboardDigest === expectedDigest) {
      await Clipboard.setStringAsync("");
    }
  } catch {
    // Clipboard access can be denied by the OS; never overwrite it without comparison.
  }
}

export function useRecoveryPhraseDisclosure() {
  const policyRef = useRef(new RecoveryPhraseDisclosurePolicy());
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
      let appSwitcherProtectionEnabled = false;
      setCaptureProtection("checking");

      const protect = async () => {
        try {
          if (!(await ScreenCapture.isAvailableAsync())) {
            if (focused) setCaptureProtection("unavailable");
            return;
          }
          await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
          if (Platform.OS === "ios") {
            await ScreenCapture.enableAppSwitcherProtectionAsync(1);
            appSwitcherProtectionEnabled = true;
          }
          if (focused) {
            setCaptureProtection("ready");
          } else {
            await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
            if (appSwitcherProtectionEnabled) {
              await ScreenCapture.disableAppSwitcherProtectionAsync();
            }
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
        clearDisclosure("blur");
        void ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(() => {});
        if (appSwitcherProtectionEnabled) {
          void ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
        }
      };
    }, [clearDisclosure]),
  );

  useEffect(() => {
    const policy = policyRef.current;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background") {
        clearDisclosure("background");
      } else if (
        nextState === "inactive" &&
        policy.getSnapshot().phase !== "authenticating"
      ) {
        clearDisclosure("app-inactive");
      }
    });

    return () => {
      subscription.remove();
      policy.clear("cleanup");
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

    if (captureProtection !== "ready") {
      setErrorMessage(
        "Screen protection is unavailable. The recovery phrase will remain hidden.",
      );
      return;
    }

    const request = policyRef.current.beginAuthentication();
    syncSnapshot();

    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware || !isEnrolled) {
        policyRef.current.authenticationFailed(request);
        syncSnapshot();
        setErrorMessage(
          "Set up Face ID, Touch ID, or fingerprint authentication in device settings before viewing your recovery phrase.",
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "View recovery phrase",
        promptSubtitle: "Authenticate to reveal your wallet recovery phrase",
        cancelLabel: "Cancel",
        fallbackLabel: "Use Device Passcode",
        disableDeviceFallback: false,
        biometricsSecurityLevel: "strong",
      });

      if (!result.success || AppState.currentState !== "active") {
        policyRef.current.authenticationFailed(request);
        syncSnapshot();
        setErrorMessage(
          result.success
            ? "Return to the app and authenticate again to view your recovery phrase."
            : "Authentication was not completed. Your recovery phrase remains hidden.",
        );
        return;
      }

      const exportRequest = policyRef.current.authenticationSucceeded(request);
      if (exportRequest === null) {
        syncSnapshot();
        return;
      }
      syncSnapshot();

      const phrase = await walletService.exportMnemonic();
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
      policyRef.current.authenticationFailed(request);
      syncSnapshot();
      setErrorMessage(
        "Device authentication is unavailable. The recovery phrase will remain hidden.",
      );
      Sentry.captureException(sanitizedSecurityError("authenticate-and-export"), {
        tags: { feature: "recovery-phrase" },
      });
    }
  }, [captureProtection, syncSnapshot]);

  const copy = useCallback(async () => {
    const phrase = policyRef.current.getActivePhrase(Date.now());
    if (!phrase || AppState.currentState !== "active") {
      clearDisclosure("inactivity");
      setErrorMessage("Authenticate again before copying the recovery phrase.");
      return;
    }

    try {
      const digest = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        phrase,
      );
      if (policyRef.current.getActivePhrase(Date.now()) !== phrase) {
        clearDisclosure("inactivity");
        return;
      }
      await Clipboard.setStringAsync(phrase);
      if (
        policyRef.current.getActivePhrase(Date.now()) !== phrase ||
        AppState.currentState !== "active"
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
