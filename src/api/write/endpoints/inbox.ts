import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSimpleSignedPayload } from "@/src/api/signing/simple-sign";

export interface MarkInboxViewedResponse {
  ok: boolean;
  inbox_last_viewed_at: number;
}

export async function markInboxViewed(
  wallet: MirageWallet,
): Promise<MarkInboxViewedResponse> {
  const signed = buildSimpleSignedPayload(
    wallet,
    `mark_inbox_viewed:${wallet.address}:{timestamp}:{nonce}`,
  );

  return api.post<MarkInboxViewedResponse>("/mark_inbox_viewed", {
    ...signed,
    address: wallet.address,
  });
}
