import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import * as ScreenCapture from "expo-screen-capture";
import { Platform } from "react-native";

let captureUsers = 0;
let captureQueue: Promise<unknown> = Promise.resolve();
export function acquireSecretScreen(): Promise<() => Promise<void>> {
  const operation = captureQueue.then(async () => {
    if (captureUsers === 0) {
      if (!(await ScreenCapture.isAvailableAsync())) throw new Error("Screen protection unavailable");
      await ScreenCapture.preventScreenCaptureAsync("wallet-secrets");
      if (Platform.OS === "ios") await ScreenCapture.enableAppSwitcherProtectionAsync(1);
    }
    captureUsers += 1;
    let released = false;
    return () => {
      const release = captureQueue.then(async () => {
        if (released) return;
        released = true;
        captureUsers -= 1;
        if (captureUsers === 0) {
          await ScreenCapture.allowScreenCaptureAsync("wallet-secrets");
          if (Platform.OS === "ios") await ScreenCapture.disableAppSwitcherProtectionAsync();
        }
      });
      captureQueue = release.catch(() => {});
      return release;
    };
  });
  captureQueue = operation.catch(() => {});
  return operation;
}

export async function clearSecretClipboardIfUnchanged(expectedDigest: string, delay = 30_000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delay));
  try {
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, await Clipboard.getStringAsync());
    if (digest === expectedDigest) await Clipboard.setStringAsync("");
  } catch {
    // An unreadable clipboard must never be overwritten.
  }
}

export async function copySecretWithExpiry(phrase: string, isCurrent: () => boolean): Promise<boolean> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, phrase);
  if (!isCurrent()) return false;
  await Clipboard.setStringAsync(phrase);
  const current = isCurrent();
  void clearSecretClipboardIfUnchanged(digest, current ? 30_000 : 0);
  return current;
}
