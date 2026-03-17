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

  return api.post<PushTokenResponse>("/core/register_push_token", {
    ...signed,
    token,
    platform,
  });
}

export async function unregisterPushToken(
  wallet: MirageWallet,
  token: string,
): Promise<PushTokenResponse> {
  const signed = buildSimpleSignedPayload(
    wallet,
    `unregister_push_token:${token}:{timestamp}:{nonce}`,
  );

  return api.post<PushTokenResponse>("/core/unregister_push_token", {
    ...signed,
    token,
  });
}
