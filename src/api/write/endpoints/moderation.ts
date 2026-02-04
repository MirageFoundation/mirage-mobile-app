/**
 * Moderation Write Endpoints
 *
 * POST /core/report - Report content (DB-backed, not on-chain)
 */

import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseReport } from "../signing";
import type { ReportResponse, PoWProgressCallback } from "../signing";

// ============================================
// Types
// ============================================

export interface ReportInput {
  /** txhash of content to report */
  target: string;
  /** Reason for report (max 200 characters) */
  reason: string;
}

// ============================================
// Report Endpoint
// ============================================

/**
 * Report content for moderation review
 *
 * This is stored in the database, not on-chain.
 * Still requires PoW and signature verification.
 */
export async function report(
  wallet: MirageWallet,
  input: ReportInput,
  onPoWProgress?: PoWProgressCallback
): Promise<ReportResponse> {
  const { target, reason } = input;

  // Validate reason length
  if (reason.length > 200) {
    throw new Error("Report reason must be 200 characters or less");
  }

  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseReport,
    payloadFields: {
      target,
      reason,
    },
    onPoWProgress,
  });

  return api.post<ReportResponse>("/core/report", payload);
}
