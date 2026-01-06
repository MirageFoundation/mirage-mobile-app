/**
 * Username Write Endpoint
 *
 * POST /core/set_username
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseSetUsername } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";

// ============================================
// Types
// ============================================

export interface SetUsernameInput {
  /** Desired username */
  username: string;
  /** Optional referrer address */
  referrer?: string;
}

export interface SetUsernamePayload {
  username: string;
  referrer?: string;
  target: string;
}

// ============================================
// Endpoint
// ============================================

/**
 * Set username for the current wallet
 *
 * @param wallet - Wallet to sign with
 * @param input - Username and optional referrer
 * @param onPoWProgress - Optional callback for PoW progress
 * @returns Write response with tx_hash
 */
export async function setUsername(
  wallet: MirageWallet,
  input: SetUsernameInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { username, referrer } = input;

  // Build signed envelope
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseSetUsername,
    payloadFields: {
      target: wallet.address,
      username,
    },
    onPoWProgress,
  });

  // Add referrer if provided (not part of signed payload)
  const body = referrer ? { ...payload, referrer } : payload;

  // Submit to API
  return api.post<WriteResponse>("/core/set_username", body);
}
