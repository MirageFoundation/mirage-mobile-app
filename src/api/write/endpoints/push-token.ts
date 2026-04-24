import * as Sentry from "@sentry/react-native";

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSimpleSignedPayload } from "../signing/simple-sign";

export interface PushTokenResponse {
  ok: boolean;
}

export interface UnregisterPushTokenRequest {
  pubkey: string;
  signature: string;
  timestamp: number;
  envelope_nonce: number;
  token: string;
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
}

export async function unregisterPushToken(
  wallet: MirageWallet,
  token: string,
): Promise<PushTokenResponse> {
  return postUnregisterPushToken(buildUnregisterPushTokenRequest(wallet, token));
}

export function buildUnregisterPushTokenRequest(
  wallet: MirageWallet,
  token: string,
): UnregisterPushTokenRequest {
  const signed = buildSimpleSignedPayload(
    wallet,
    `unregister_push_token:${token}:{timestamp}:{nonce}`,
  );

  return {
    ...signed,
    token,
  };
}

export async function postUnregisterPushToken(
  request: UnregisterPushTokenRequest,
): Promise<PushTokenResponse> {
  const response = await api.post<PushTokenResponse>("/core/unregister_push_token", request);

  Sentry.addBreadcrumb({
    category: "push-notifications",
    message: "API: unregister_push_token succeeded",
    level: "info",
  });
  return response;
}
