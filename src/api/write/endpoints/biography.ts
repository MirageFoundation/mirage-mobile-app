import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseSetBiography } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

export async function setBiography(
  wallet: MirageWallet,
  biography: string,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  if (biography.length > 512) {
    throw new Error("Biography must be 512 characters or less");
  }

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseSetBiography,
      payloadFields: {
        target: wallet.address,
        biography,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/set_biography", payload);
  }, "setBiography");
}
