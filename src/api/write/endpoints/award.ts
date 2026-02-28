import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseAward } from "../signing";
import type { WriteResponse } from "../signing";

export interface GiveAwardInput {
  target: string;
  award_type: string;
}

export async function giveAward(
  wallet: MirageWallet,
  input: GiveAwardInput
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseAward,
    payloadFields: {
      target: input.target.toLowerCase(),
      award_type: input.award_type,
    },
    skipPoW: true,
  });

  return api.post<WriteResponse>("/core/award", payload);
}
