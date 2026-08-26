import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Updates from "expo-updates";
import { AppState } from "react-native";

import { IS_FDROID_BUILD } from "@/src/config/build-flags";
import { storage } from "@/src/stores/mmkv-storage";

type StartupPhase = "sentry_initialized" | "root_ready" | "stable";

type StartupRecord = {
  launchId: string;
  startedAt: number;
  phase: StartupPhase;
  appVersion: string;
  buildNumber: string;
  runtimeVersion: string;
  updateId: string;
  isEmbeddedLaunch: boolean;
  launchSource?: "direct" | "deep_link" | "unknown";
};

const STARTUP_RECORD_KEY = "startup-diagnostics-current-v1";
const EXPO_LOG_CURSOR_KEY = "startup-diagnostics-expo-log-cursor-v1";
const PREVIOUS_LAUNCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EXPO_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EXPO_LOG_ENTRIES = 10;
const ACTIONABLE_EXPO_LOG_CODES = new Set([
  "UpdateAssetsNotAvailable",
  "UpdateHasInvalidSignature",
  "UpdateCodeSigningError",
  "JSRuntimeError",
  "InitializationError",
]);

let currentLaunchId: string | null = null;

function readStartupRecord(): StartupRecord | null {
  const raw = storage.getString(STARTUP_RECORD_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StartupRecord;
  } catch {
    storage.remove(STARTUP_RECORD_KEY);
    return null;
  }
}

function writeStartupRecord(record: StartupRecord): void {
  storage.set(STARTUP_RECORD_KEY, JSON.stringify(record));
}

async function reportInitialLaunchSource(launchId: string): Promise<void> {
  try {
    const initialUrl = await Linking.getInitialURL();
    const launchSource = initialUrl ? "deep_link" : "direct";
    const record = readStartupRecord();
    if (record?.launchId === launchId) {
      writeStartupRecord({ ...record, launchSource });
    }
    Sentry.setTag("launch_source", launchSource);
    Sentry.addBreadcrumb({
      category: "startup",
      message: "Initial launch source resolved",
      level: "info",
      data: { launchSource },
    });
  } catch (error) {
    Sentry.setTag("launch_source", "unknown");
    Sentry.addBreadcrumb({
      category: "startup",
      message: "Initial launch source could not be resolved",
      level: "warning",
      data: { error: String(error) },
    });
  }
}

function updateStartupPhase(phase: StartupPhase): void {
  if (!currentLaunchId) return;
  const record = readStartupRecord();
  if (!record || record.launchId !== currentLaunchId) return;

  writeStartupRecord({ ...record, phase });
  Sentry.setTag("startup_phase", phase);
  Sentry.addBreadcrumb({
    category: "startup",
    message: `Startup phase reached: ${phase}`,
    level: "info",
  });
}

function reportPreviousIncompleteLaunch(previous: StartupRecord | null): void {
  if (!previous || previous.phase === "stable") return;
  if (Date.now() - previous.startedAt > PREVIOUS_LAUNCH_MAX_AGE_MS) return;

  Sentry.setContext("previous_launch", previous);
  Sentry.addBreadcrumb({
    category: "startup",
    message: "Previous launch did not reach stable startup",
    level: "warning",
    data: previous,
  });

  if (previous.phase !== "sentry_initialized") return;

  const error = new Error("Previous launch failed before the root layout became ready");
  error.name = "IncompleteStartupError";
  Sentry.captureException(error, {
    tags: {
      feature: "startup-diagnostics",
      operation: "previous-launch-check",
      previous_startup_phase: previous.phase,
      previous_update_id: previous.updateId,
    },
    extra: { previousLaunch: previous },
  });
}

async function reportExpoUpdateDiagnostics(): Promise<void> {
  if (Updates.isEmergencyLaunch) {
    const error = new Error("Expo Updates started Mirage in emergency launch mode");
    error.name = "ExpoUpdatesEmergencyLaunchError";
    Sentry.captureException(error, {
      tags: {
        feature: "startup-diagnostics",
        operation: "expo-emergency-launch",
        update_id: Updates.updateId ?? "embedded",
      },
      extra: {
        emergencyLaunchReason: Updates.emergencyLaunchReason,
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        runtimeVersion: Updates.runtimeVersion,
      },
    });
  }

  try {
    const cursor = Number(storage.getString(EXPO_LOG_CURSOR_KEY) ?? "0");
    const entries = await Updates.readLogEntriesAsync(EXPO_LOG_MAX_AGE_MS);
    const newEntries = entries.filter((entry) => entry.timestamp > cursor);
    const actionableEntries = newEntries
      .filter((entry) =>
        entry.level === "fatal" ||
        ACTIONABLE_EXPO_LOG_CODES.has(entry.code)
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_EXPO_LOG_ENTRIES);

    const latestTimestamp = newEntries.reduce(
      (latest, entry) => Math.max(latest, entry.timestamp),
      cursor,
    );
    if (latestTimestamp > cursor) {
      storage.set(EXPO_LOG_CURSOR_KEY, String(latestTimestamp));
    }
    if (actionableEntries.length === 0) return;

    const latestEntry = actionableEntries[actionableEntries.length - 1];
    const error = new Error("Expo Updates recorded startup or update failures");
    error.name = "ExpoUpdatesDiagnosticError";
    Sentry.captureException(error, {
      tags: {
        feature: "startup-diagnostics",
        operation: "expo-log-recovery",
        expo_update_code: latestEntry.code,
        expo_update_id: latestEntry.updateId ?? Updates.updateId ?? "unknown",
      },
      extra: {
        expoUpdateLogs: actionableEntries,
        currentUpdateId: Updates.updateId,
        runtimeVersion: Updates.runtimeVersion,
      },
    });
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "startup",
      message: "Failed to read Expo Updates diagnostics",
      level: "warning",
      data: { error: String(error) },
    });
  }
}

function beginStartupDiagnostics(): void {
  // Headless launches (background fetch, boot-time task start, silent push)
  // execute this bundle without ever mounting the root layout. Writing a
  // startup record here would clobber the previous foreground launch's
  // record with one permanently stuck at "sentry_initialized", making every
  // subsequent foreground launch report a false IncompleteStartupError.
  // AppState is "background" only for headless launches — a foreground cold
  // start reports "active" (Android) or "inactive" (iOS pre-activation).
  if (AppState.currentState === "background") return;

  const previous = readStartupRecord();
  const now = Date.now();
  const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown";
  const buildNumber = Constants.nativeBuildVersion ?? "unknown";
  currentLaunchId = `${now}-${Math.random().toString(36).slice(2, 10)}`;

  const current: StartupRecord = {
    launchId: currentLaunchId,
    startedAt: now,
    phase: "sentry_initialized",
    appVersion,
    buildNumber,
    runtimeVersion: Updates.runtimeVersion ?? "unknown",
    updateId: Updates.updateId ?? "embedded",
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };

  writeStartupRecord(current);
  Sentry.setTag("startup_phase", current.phase);
  Sentry.setContext("current_launch", current);
  reportPreviousIncompleteLaunch(previous);
  void reportInitialLaunchSource(current.launchId);
  void reportExpoUpdateDiagnostics();
}

export function markStartupRootReady(): void {
  updateStartupPhase("root_ready");
}

export function markStartupStable(): void {
  updateStartupPhase("stable");
}

if (!__DEV__ && !IS_FDROID_BUILD) {
  beginStartupDiagnostics();
}
