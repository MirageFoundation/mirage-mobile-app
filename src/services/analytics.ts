/**
 * Analytics Service (Mixpanel)
 *
 * Single wrapper around the Mixpanel SDK. No other module should import
 * `mixpanel-react-native` directly.
 *
 * Consent-gated: the SDK is only initialized after the user opts in
 * (EU/GDPR requirement). Until then every call is a no-op.
 *
 * Identity model:
 * - distinct_id = wallet address (stable, pseudonymous)
 * - identify() on wallet creation confirm, wallet import, and logged-in startup
 * - reset() on logout
 */

import { Mixpanel, type MixpanelAsyncStorage } from "mixpanel-react-native";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import { storage } from "@/src/stores/mmkv-storage";
import {
  AnalyticsConsentCoordinator,
  type AnalyticsSdk,
} from "@/src/services/analytics-consent-coordinator";

const MIXPANEL_TOKEN =
  process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ??
  "e7862d41388bd49a1f8ad11025792672";

// Automatic events ($ae_session etc.) power session duration reporting.
// Note: Mixpanel deprecated legacy automatic events for new projects;
// session metrics primarily come from server-side session computation.
const TRACK_AUTOMATIC_EVENTS = true;

const IS_DEV = __DEV__;

export type AnalyticsEventName =
  | "analytics_consent_granted"
  | "app_opened"
  | "onboarding_started"
  | "username_set"
  | "recovery_phrase_viewed"
  | "sign_up_completed"
  | "login_completed"
  | "post_create_opened"
  | "post_created"
  | "comment_posted"
  | "vote_cast"
  | "user_followed"
  | "topic_followed";

type AnalyticsProperties = Record<
  string,
  string | number | boolean | undefined
>;

const mixpanelStorage: MixpanelAsyncStorage = {
  getItem: async (key) => storage.getString(key) ?? null,
  setItem: async (key, value) => {
    storage.set(key, value);
  },
  removeItem: async (key) => {
    storage.remove(key);
  },
};

const MixpanelWithStorage = Mixpanel as unknown as {
  new (
    token: string,
    trackAutomaticEvents: boolean,
    useNative?: boolean,
    storage?: MixpanelAsyncStorage,
  ): Mixpanel;
};

function stripUndefined(props?: AnalyticsProperties): Record<string, unknown> {
  if (!props) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

const analyticsCoordinator = new AnalyticsConsentCoordinator(
  () =>
    new MixpanelWithStorage(
      MIXPANEL_TOKEN,
      TRACK_AUTOMATIC_EVENTS,
      true,
      mixpanelStorage,
    ) as unknown as AnalyticsSdk,
  {
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? "unknown",
  },
);

/**
 * Initialize the SDK. Call only after analytics consent is granted.
 * Safe to call multiple times.
 */
export async function initAnalytics(): Promise<void> {
  await setAnalyticsTrackingEnabled(true);
}

/**
 * Apply a consent change. Granting initializes the SDK; revoking opts the
 * device out and clears local analytics state.
 */
export async function setAnalyticsTrackingEnabled(
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    try {
      const newlyGranted = await analyticsCoordinator.enable();
      if (!newlyGranted || !analyticsCoordinator.isActive()) return;
      analyticsCoordinator.track("analytics_consent_granted");
      analyticsCoordinator.flush();
      if (IS_DEV) {
        console.log("[Analytics] Mixpanel initialized");
      }
    } catch (error) {
      console.warn("[Analytics] Failed to initialize Mixpanel:", error);
      Sentry.captureException(error, {
        tags: { feature: "analytics", operation: "init" },
      });
    }
    return;
  }
  await analyticsCoordinator.disable();
}

export function isAnalyticsActive(): boolean {
  return analyticsCoordinator.isActive();
}

export function identifyUser(
  walletAddress: string,
  profile?: { username?: string | null; tier?: string },
): void {
  const profileProps = stripUndefined({
    username: profile?.username ?? undefined,
    tier: profile?.tier,
  });
  void analyticsCoordinator.identify(walletAddress, profileProps).catch(() => {});
}

export function updateUserProfile(profile: {
  username?: string | null;
  tier?: string;
}): void {
  const props = stripUndefined({
    username: profile.username ?? undefined,
    tier: profile.tier,
  });
  analyticsCoordinator.setProfile(props);
}

export function registerTierSuperProperty(tier: string): void {
  analyticsCoordinator.registerSuperProperties({ tier });
}

export function resetAnalyticsIdentity(): void {
  void analyticsCoordinator.resetIdentity().catch(() => {});
}

export function trackEvent(
  event: AnalyticsEventName,
  properties?: AnalyticsProperties,
): void {
  if (!analyticsCoordinator.isActive()) {
    if (IS_DEV) console.log(`[Analytics] (no-op, no consent) ${event}`);
    return;
  }
  if (IS_DEV) console.log(`[Analytics] track: ${event}`, properties ?? {});
  analyticsCoordinator.track(event, stripUndefined(properties));
  if (IS_DEV) analyticsCoordinator.flush();
}

export function flushAnalytics(): void {
  analyticsCoordinator.flush();
}
