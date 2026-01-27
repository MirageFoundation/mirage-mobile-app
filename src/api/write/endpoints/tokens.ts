/**
 * Token & Subscription Write Endpoints
 *
 * POST /core/send_tokens
 * POST /core/upgrade_level
 * POST /core/set_auto_renewal
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseSendTokens,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";

// ============================================
// Types
// ============================================

export interface SendTokensInput {
  /** Recipient address */
  recipient: string;
  /** Amount in umirage (integer, smallest unit) */
  amount: number;
}

export type SubscriptionLevel = 1 | 2 | 3;

// ============================================
// Send Tokens
// ============================================

/**
 * Send tokens to another address
 */
export async function sendTokens(
  wallet: MirageWallet,
  input: SendTokensInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const { recipient, amount } = input;

  return withPowRetry(async () => {
    const payload = await buildSignedEnvelope({
      wallet,
      baseBuilder: canonBaseSendTokens,
      payloadFields: {
        sender: wallet.address,
        target: recipient,
        amount,
      },
      onPoWProgress,
    });

    return api.post<WriteResponse>("/core/send_tokens", payload);
  }, "sendTokens");
}

// ============================================
// Subscription Management
// ============================================

/**
 * Upgrade to a paid subscription tier
 *
 * NOTE: This operation does NOT require PoW
 */
export async function upgradeLevel(
  wallet: MirageWallet,
  level: SubscriptionLevel
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUpgradeLevel,
    payloadFields: {
      level,
    },
    skipPoW: true, // Paid operations don't need PoW
  });

  return api.post<WriteResponse>("/core/upgrade_level", payload);
}

/**
 * Set auto-renewal for subscription
 *
 * NOTE: This operation does NOT require PoW
 */
export async function setAutoRenewal(
  wallet: MirageWallet,
  autoRenew: boolean
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseSetAutoRenewal,
    payloadFields: {
      autoRenew,
    },
    skipPoW: true, // Paid operations don't need PoW
  });

  return api.post<WriteResponse>("/core/set_auto_renewal", payload);
}
