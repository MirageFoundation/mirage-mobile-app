/**
 * Username Write Endpoint
 *
 * POST /core/set_username
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseSetUsername } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

export interface SetUsernameInput {
  username: string;
}

export interface SetUsernamePayload {
  username: string;
  target: string;
}

/**
 * Set username for the current wallet
 */
export async function setUsername(
  wallet: MirageWallet,
  input: SetUsernameInput,
  onPoWProgress?: PoWProgressCallback,
  checkpoint?: { beforeBroadcast: () => void; onSubmitted: (hash: string) => void },
): Promise<WriteResponse> {
  const { username } = input;

  const operation = async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseSetUsername,
      payloadFields: {
        target: wallet.address,
        username,
      },
      onPoWProgress,
    });

    checkpoint?.beforeBroadcast();
    try {
      const response = await api.post<WriteResponse>("/core/set_username", payload);
      checkpoint?.onSubmitted(response.tx_hash);
      return response;
    } catch (error) {
      const hash = (error as { response?: { data?: { tx_hash?: unknown } } })?.response?.data?.tx_hash;
      if (typeof hash === "string" && hash) checkpoint?.onSubmitted(hash);
      throw error;
    }
  };
  return checkpoint ? operation() : withPowRetry(operation, "setUsername");
}
