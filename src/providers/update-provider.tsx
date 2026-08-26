import NetInfo from "@react-native-community/netinfo";
import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InteractionManager, Platform } from "react-native";

import { IS_FDROID_BUILD } from "@/src/config/build-flags";

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

export type EasUpdateStatus = "idle" | "available" | "installing" | "error";
export type ForceUpdateReason = "native" | null;

type UpdateContextValue = {
  easUpdate: {
    status: EasUpdateStatus;
    install: () => Promise<void>;
    dismiss: () => void;
  };
  forceUpdate: {
    reason: ForceUpdateReason;
    remoteVersion: string | null;
    isRequired: boolean;
  };
};

const UpdateContext = createContext<UpdateContextValue | null>(null);

function isVersionOutdated(current: string, required: string): boolean {
  const currentParts = current.split(".").map(Number);
  const requiredParts = required.split(".").map(Number);

  for (let index = 0; index < requiredParts.length; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const requiredPart = requiredParts[index] ?? 0;
    if (currentPart < requiredPart) return true;
    if (currentPart > requiredPart) return false;
  }

  return false;
}

async function fetchVersionConfig(): Promise<PlatformVersionConfig | null> {
  try {
    const response = await fetch(VERSION_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const config = (await response.json()) as VersionConfig;
    return Platform.OS === "ios" ? config.ios : config.android;
  } catch {
    return null;
  }
}

function waitForInteractions(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, 800);
    });
  });
}

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const updates = Updates.useUpdates();
  const installInFlightRef = useRef(false);
  const [remoteConfig, setRemoteConfig] = useState<PlatformVersionConfig | null>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "error">("idle");
  const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__ || IS_FDROID_BUILD) return;

    let cancelled = false;
    void fetchVersionConfig().then((config) => {
      if (!cancelled) setRemoteConfig(config);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const candidateUpdate = updates.downloadedUpdate ?? updates.availableUpdate;
  const updateKey = candidateUpdate
    ? candidateUpdate.updateId ?? `rollback:${candidateUpdate.createdAt.toISOString()}`
    : null;
  const isDismissed = updateKey !== null && dismissedUpdateKey === updateKey;
  const hasOtaUpdate = updates.isUpdateAvailable || updates.isUpdatePending;

  const status: EasUpdateStatus = useMemo(() => {
    if (__DEV__ || IS_FDROID_BUILD) return "idle";
    if (installStatus === "error") return "error";
    if (installStatus === "installing" || updates.isDownloading || updates.isRestarting) {
      return "installing";
    }
    if (hasOtaUpdate && !isDismissed) return "available";
    return "idle";
  }, [hasOtaUpdate, installStatus, isDismissed, updates.isDownloading, updates.isRestarting]);

  const install = useCallback(async () => {
    if (__DEV__ || IS_FDROID_BUILD || installInFlightRef.current) return;

    installInFlightRef.current = true;
    setInstallStatus("installing");

    try {
      if (!updates.isUpdatePending) {
        const network = await NetInfo.fetch();
        if (!network.isConnected || network.isInternetReachable === false) {
          throw new Error("Internet connection is unavailable");
        }

        const result = await Updates.fetchUpdateAsync();
        if (!result.isNew && !result.isRollBackToEmbedded) {
          setInstallStatus("idle");
          return;
        }
      }

      await waitForInteractions();
      await Updates.reloadAsync();
    } catch (error) {
      Sentry.addBreadcrumb({
        category: "eas-update",
        message: "User-triggered OTA update install failed",
        level: "warning",
        data: { error: String(error), updateKey },
      });
      setInstallStatus("error");
    } finally {
      installInFlightRef.current = false;
    }
  }, [updateKey, updates.isUpdatePending]);

  const dismiss = useCallback(() => {
    setDismissedUpdateKey(updateKey);
    setInstallStatus("idle");
  }, [updateKey]);

  const nativeVersion = Application.nativeApplicationVersion;
  const requiresNativeUpdate =
    remoteConfig !== null &&
    nativeVersion !== null &&
    isVersionOutdated(nativeVersion, remoteConfig.version);

  const value = useMemo<UpdateContextValue>(
    () => ({
      easUpdate: { status, install, dismiss },
      forceUpdate: {
        reason: requiresNativeUpdate ? "native" : null,
        remoteVersion: remoteConfig?.version ?? null,
        isRequired: remoteConfig?.required ?? true,
      },
    }),
    [dismiss, install, remoteConfig, requiresNativeUpdate, status],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

function useUpdateContext(): UpdateContextValue {
  const value = useContext(UpdateContext);
  if (!value) {
    throw new Error("Update hooks must be used within UpdateProvider");
  }
  return value;
}

export function useEasUpdateContext() {
  return useUpdateContext().easUpdate;
}

export function useForceUpdateContext() {
  return useUpdateContext().forceUpdate;
}
