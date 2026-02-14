import { useCallback, useEffect, useRef, useState } from "react";
import * as Updates from "expo-updates";

export type EasUpdateStatus = "idle" | "available" | "installing" | "error";

export function useEasUpdate() {
  const [status, setStatus] = useState<EasUpdateStatus>("idle");
  const hasChecked = useRef(false);

  useEffect(() => {
    if (__DEV__ || hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setStatus("available");
        }
      } catch {}
    })();
  }, []);

  const install = useCallback(async () => {
    setStatus("installing");
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setStatus("error");
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
  }, []);

  return { status, install, dismiss };
}
