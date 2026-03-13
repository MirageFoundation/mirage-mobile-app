import { useEffect, useRef, useState } from "react";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

export const REQUIRED_VERSION = "1.0.7";

function isVersionOutdated(current: string, required: string): boolean {
  const cur = current.split(".").map(Number);
  const req = required.split(".").map(Number);
  for (let i = 0; i < req.length; i++) {
    const c = cur[i] ?? 0;
    const r = req[i] ?? 0;
    if (c < r) return true;
    if (c > r) return false;
  }
  return false;
}

export type ForceUpdateReason = "native" | "ota" | null;

export function useForceUpdate() {
  const [reason, setReason] = useState<ForceUpdateReason>(null);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (__DEV__ || hasChecked.current) return;
    hasChecked.current = true;

    const appVersion = Constants.expoConfig?.version ?? "0.0.0";

    if (isVersionOutdated(appVersion, REQUIRED_VERSION)) {
      setReason("native");
      return;
    }

    (async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          setReason("ota");
        }
      } catch {}
    })();
  }, []);

  return { reason };
}
