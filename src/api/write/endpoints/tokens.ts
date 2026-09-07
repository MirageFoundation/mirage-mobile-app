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
  canonBaseSubscribe,
  canonBaseSetAutoRenewal,
} from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";
import { withPowRetry } from "../utils/retry-pow";
import {
  assertPeriodCount,
  PURCHASABLE_SUBSCRIPTION_LEVEL,
} from "@/src/domain/subscriptions";

// ============================================
// Types
// ============================================

export interface SendTokensInput {
  /** Recipient address */
  recipient: string;
  /** Amount in umirage (integer, smallest unit) */
  amount: number;
}

export type SubscriptionLevel = 1;

const SUBSCRIPTION_LEVEL = PURCHASABLE_SUBSCRIPTION_LEVEL;

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
  periodCount: number
): Promise<WriteResponse> {
  const validatedPeriodCount = assertPeriodCount(periodCount);
  addSubscriptionBreadcrumb("Subscription request started", {
    action: "subscribe",
    endpoint: "/core/subscribe",
    messageType: "MsgSubscribe",
    level: SUBSCRIPTION_LEVEL,
    period_count: validatedPeriodCount,
  });

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseSubscribe,
    payloadFields: {
      level: SUBSCRIPTION_LEVEL,
      periodCount: validatedPeriodCount,
    },
    skipPoW: true, // Paid operations don't need PoW
  });

  const { periodCount: _periodCount, ...rest } = payload;
  const response = await api.post<WriteResponse>("/core/subscribe", {
    ...rest,
    period_count: validatedPeriodCount,
  });
  addSubscriptionBreadcrumb("Subscription request submitted", {
    action: "subscribe",
    endpoint: "/core/subscribe",
    level: SUBSCRIPTION_LEVEL,
    period_count: validatedPeriodCount,
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
  periodCount: number;
}

export async function giftSubscription(
  wallet: MirageWallet,
  input: GiftSubscriptionInput
): Promise<WriteResponse> {
  const { recipient } = input;
  const validatedPeriodCount = assertPeriodCount(input.periodCount);

  addSubscriptionBreadcrumb("Gift subscription request started", {
    action: "gift_subscription",
    endpoint: "/core/subscribe",
    messageType: "MsgSubscribe",
    level: SUBSCRIPTION_LEVEL,
    period_count: validatedPeriodCount,
    hasRecipient: Boolean(recipient),
  });

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseSubscribe,
    payloadFields: {
      level: SUBSCRIPTION_LEVEL,
      target: recipient,
      periodCount: validatedPeriodCount,
    },
    skipPoW: true,
  });

  const { periodCount: _periodCount, ...rest } = payload;
  const response = await api.post<WriteResponse>("/core/subscribe", {
    ...rest,
    period_count: validatedPeriodCount,
  });
  addSubscriptionBreadcrumb("Gift subscription request submitted", {
    action: "gift_subscription",
    endpoint: "/core/subscribe",
    level: SUBSCRIPTION_LEVEL,
    period_count: validatedPeriodCount,
    hasRecipient: Boolean(recipient),
    txHash: response.tx_hash,
  });
  return response;
}
