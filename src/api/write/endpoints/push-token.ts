import * as Sentry from "@sentry/react-native";

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSimpleSignedPayload } from "../signing/simple-sign";

export interface PushTokenResponse {
  ok: boolean;
}

export async function registerPushToken(
  wallet: MirageWallet,
  token: string,
  platform: "ios" | "android",
): Promise<PushTokenResponse> {
  const signed = buildSimpleSignedPayload(
    wallet,
    `register_push_token:${token}:${platform}:{timestamp}:{nonce}`,
  );

  try {
    const response = await api.post<PushTokenResponse>("/core/register_push_token", {
      ...signed,
      token,
      platform,
    });
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "API: register_push_token succeeded",
      data: { platform },
      level: "info",
    });
    return response;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "api-register-push-token" },
      extra: { platform },
    });
    throw error;
  }
}

export async function unregisterPushToken(
  wallet: MirageWallet,
  token: string,
): Promise<PushTokenResponse> {
  const signed = buildSimpleSignedPayload(
    wallet,
    `unregister_push_token:${token}:{timestamp}:{nonce}`,
  );

  try {
    const response = await api.post<PushTokenResponse>("/core/unregister_push_token", {
      ...signed,
      token,
    });
    Sentry.addBreadcrumb({
      category: "push-notifications",
      message: "API: unregister_push_token succeeded",
      level: "info",
    });
    return response;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "push-notifications", operation: "api-unregister-push-token" },
    });
    throw error;
  }
}
