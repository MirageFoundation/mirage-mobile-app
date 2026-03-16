import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";

const VERSION_CONFIG_URL =
  "https://raw.githubusercontent.com/mesonalirajput/mirage-remote-config/main/app-version.json";

type PlatformVersionConfig = {
  version: string;
  required: boolean;
};

type VersionConfig = {
  ios: PlatformVersionConfig;
  android: PlatformVersionConfig;
};

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

async function fetchVersionConfig(): Promise<PlatformVersionConfig | null> {
  try {
    const res = await fetch(VERSION_CONFIG_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const config = (await res.json()) as VersionConfig;
    return Platform.OS === "ios" ? config.ios : config.android;
  } catch {
    return null;
  }
}

export type ForceUpdateReason = "native" | "ota" | null;

export function useForceUpdate() {
  const [reason, setReason] = useState<ForceUpdateReason>(null);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [isRequired, setIsRequired] = useState(true);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (__DEV__ || hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      const appVersion = Constants.expoConfig?.version ?? "0.0.0";

      const config = await fetchVersionConfig();
      Sentry.addBreadcrumb({ category: "force-update", message: `app: ${appVersion}, platform: ${Platform.OS}, remote: ${JSON.stringify(config)}` });
      if (config) {
        setRemoteVersion(config.version);
        if (isVersionOutdated(appVersion, config.version)) {
          setIsRequired(config.required);
          Sentry.addBreadcrumb({ category: "force-update", message: `native update ${config.required ? "required" : "available"}` });
          setReason("native");
          return;
        }
      }

      try {
        const update = await Updates.checkForUpdateAsync();
        Sentry.addBreadcrumb({ category: "force-update", message: `OTA available: ${update.isAvailable}` });
        if (update.isAvailable) {
          setReason("ota");
        }
      } catch {}
    })();
  }, []);

  return { reason, remoteVersion, isRequired };
}
