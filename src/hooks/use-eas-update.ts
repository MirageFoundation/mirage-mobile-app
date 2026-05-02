import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";
import { IS_FDROID_BUILD } from "@/src/config/build-flags";

export type EasUpdateStatus = "idle" | "available" | "installing" | "error";

export function useEasUpdate() {
  const [status, setStatus] = useState<EasUpdateStatus>("idle");
  const hasChecked = useRef(false);

  useEffect(() => {
    if (__DEV__ || IS_FDROID_BUILD || hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setStatus("available");
        }
      } catch {}
      // Sentry breadcrumb for check failure handled silently
    })();
  }, []);

  const install = useCallback(async () => {
    if (IS_FDROID_BUILD) return;

    setStatus("installing");
    try {
      await Updates.fetchUpdateAsync();
      setStatus("idle");
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 800);
        });
      });
      await Updates.reloadAsync();
    } catch {
      Sentry.addBreadcrumb({ category: "eas-update", message: "OTA update install failed", level: "error" });
      setStatus("error");
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
  }, []);

  return { status, install, dismiss };
}
