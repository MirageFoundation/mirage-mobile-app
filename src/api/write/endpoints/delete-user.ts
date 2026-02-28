import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseDeleteUser } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

export interface DeleteUserInput {
  target: string;
}

export async function deleteUser(
  wallet: MirageWallet,
  input: DeleteUserInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseDeleteUser,
      payloadFields: {
        target: input.target.toLowerCase(),
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/delete_user", payload);
  }, "deleteUser");
}
