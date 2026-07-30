import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

import { IS_FDROID_BUILD } from "@/src/config/build-flags";

const SENTRY_TRACES_SAMPLE_RATE = 0.02;
const SENTRY_ERROR_REPLAY_SAMPLE_RATE = 0.1;
const SENTRY_WARNING_MESSAGE_SAMPLE_RATE = 0.1;

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

const appEnvironment = __DEV__
  ? "development"
  : process.env.EXPO_PUBLIC_ENV || "production";
const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "unknown";
const buildNumber = Constants.nativeBuildVersion ?? Platform.select({
  android: Constants.expoConfig?.android?.versionCode?.toString(),
  ios: Constants.expoConfig?.ios?.buildNumber,
  default: undefined,
});
const updateId = Updates.updateId ?? "embedded";

function shouldDropSentryEvent(event: Sentry.ErrorEvent): boolean {
  const message = event.exception?.values?.[0]?.value?.toLowerCase() ?? "";
  if (
    message.includes("getregistrationinfoasync") ||
    message.includes("keychain access failed") ||
    message.includes("user interaction is not allowed")
  ) {
    return true;
  }
  if (
    message.includes("performhapticsasync") ||
    message.includes("a haptics engine is not available")
  ) {
    return true;
  }

  if (event.level === "info") return true;
  if (
    event.level === "warning" &&
    event.message &&
    Math.random() >= SENTRY_WARNING_MESSAGE_SAMPLE_RATE
  ) {
    return true;
  }

  return false;
}

Sentry.init({
  dsn: IS_FDROID_BUILD
    ? undefined
    : "https://34f3ac8d124f7b5edbbb02ff36ac1a2b@o4510907183595520.ingest.us.sentry.io/4510907185496064",
  enabled: !IS_FDROID_BUILD,
  environment: appEnvironment,
  release: `mirage@${appVersion}`,
  dist: buildNumber,
  sendDefaultPii: !__DEV__ && !IS_FDROID_BUILD,
  tracesSampleRate: __DEV__ || IS_FDROID_BUILD ? 0 : SENTRY_TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate:
    __DEV__ || IS_FDROID_BUILD ? 0 : SENTRY_ERROR_REPLAY_SAMPLE_RATE,
  integrations: IS_FDROID_BUILD
    ? []
    : __DEV__
      ? [navigationIntegration]
      : [Sentry.mobileReplayIntegration(), navigationIntegration],
  enableAutoPerformanceTracing: !__DEV__ && !IS_FDROID_BUILD,
  beforeSend(event) {
    if (shouldDropSentryEvent(event)) return null;
    return event;
  },
});

Sentry.setTags({
  app_env: appEnvironment,
  app_platform: Platform.OS,
  fdroid_build: String(IS_FDROID_BUILD),
  native_app_version: appVersion,
  native_build_number: buildNumber ?? "unknown",
  update_channel: Updates.channel ?? "embedded",
  update_runtime_version: Updates.runtimeVersion ?? "unknown",
  update_id: updateId,
  diagnostic_focus: __DEV__ ? "expo-video-migration" : "none",
});
Sentry.setContext("app_update", {
  appVersion,
  buildNumber,
  updateId,
  channel: Updates.channel ?? "embedded",
  runtimeVersion: Updates.runtimeVersion ?? "unknown",
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  isEmergencyLaunch: Updates.isEmergencyLaunch,
  emergencyLaunchReason: Updates.emergencyLaunchReason,
  launchDuration: Updates.launchDuration,
});
