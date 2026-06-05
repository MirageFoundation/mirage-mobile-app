/**
 * Token & Subscription Write Endpoints
 *
 * POST /core/send_tokens
 * POST /core/subscribe
 * POST /core/set_auto_renewal
 */

import { api } from "@/src/api/client";
import * as Sentry from "@sentry/react-native";
import type { MirageWallet } from "@/src/wallet";
import {
  buildSignedEnvelope,
  canonBaseSendTokens,
  canonBaseUpgradeLevel,
  canonBaseSetAutoRenewal,
  canonBaseGiftSubscription,
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

export type SubscriptionLevel = 1 | 10;

function addSubscriptionBreadcrumb(
  message: string,
  data: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    category: "subscription",
    message,
    level: "info",
    data,
  });
}

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
 * Subscribe to a paid tier.
 *
 * NOTE: This operation does NOT require PoW
 */
export async function upgradeLevel(
  wallet: MirageWallet,
  level: SubscriptionLevel
): Promise<WriteResponse> {
  addSubscriptionBreadcrumb("Subscription request started", {
    action: "subscribe",
    endpoint: "/core/subscribe",
    messageType: "MsgSubscribe",
    level,
  });

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseUpgradeLevel,
    payloadFields: {
      level,
    },
    skipPoW: true, // Paid operations don't need PoW
  });

  const response = await api.post<WriteResponse>("/core/subscribe", payload);
  addSubscriptionBreadcrumb("Subscription request submitted", {
    action: "subscribe",
    endpoint: "/core/subscribe",
    level,
    txHash: response.tx_hash,
  });
  return response;
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
  addSubscriptionBreadcrumb("Auto-renewal request started", {
    action: "set_auto_renewal",
    endpoint: "/core/set_auto_renewal",
    messageType: "MsgSetAutoRenewal",
    autoRenew,
  });

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseSetAutoRenewal,
    payloadFields: {
      autoRenew,
    },
    skipPoW: true, // Paid operations don't need PoW
  });

  const { autoRenew: _, ...rest } = payload;
  const response = await api.post<WriteResponse>("/core/set_auto_renewal", { ...rest, auto_renew: autoRenew });
  addSubscriptionBreadcrumb("Auto-renewal request submitted", {
    action: "set_auto_renewal",
    endpoint: "/core/set_auto_renewal",
    autoRenew,
    txHash: response.tx_hash,
  });
  return response;
}

// ============================================
// Gift Subscription
// ============================================

export interface GiftSubscriptionInput {
  recipient: string;
  level: SubscriptionLevel;
}

export async function giftSubscription(
  wallet: MirageWallet,
  input: GiftSubscriptionInput
): Promise<WriteResponse> {
  const { recipient, level } = input;

  addSubscriptionBreadcrumb("Gift subscription request started", {
    action: "gift_subscription",
    endpoint: "/core/subscribe",
    messageType: "MsgSubscribe",
    level,
    hasRecipient: Boolean(recipient),
  });

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseGiftSubscription,
    payloadFields: {
      level,
      target: recipient,
    },
    skipPoW: true,
  });

  const response = await api.post<WriteResponse>("/core/subscribe", payload);
  addSubscriptionBreadcrumb("Gift subscription request submitted", {
    action: "gift_subscription",
    endpoint: "/core/subscribe",
    level,
    hasRecipient: Boolean(recipient),
    txHash: response.tx_hash,
  });
  return response;
}
