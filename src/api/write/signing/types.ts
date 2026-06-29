/**
 * Types for Write API Signing
 */

import type { MirageWallet } from "@/src/wallet";

// ============================================
// Envelope Types
// ============================================

/**
 * Base envelope fields required for all write requests
 */
export interface SignedEnvelope {
  /** base64 of 33-byte compressed pubkey */
  pubkey: string;
  /** base64 of 64-byte compact signature */
  signature: string;
  /** milliseconds since epoch */
  timestamp: number;
  /** hex string of latest block hash */
  last_block_hash: string;
  /** PoW difficulty (0 for paid tier) */
  pow_difficulty: number;
  /** PoW nonce (0 for paid tier) */
  pow: number;
  /** Replay-protection nonce as a decimal string */
  envelope_nonce: string;
}

/**
 * Signed payload ready for API submission
 * Combines envelope with message-specific fields
 */
export type SignedPayload<T extends Record<string, unknown> = Record<string, unknown>> = 
  SignedEnvelope & T;

// ============================================
// Common Response Types
// ============================================

/**
 * Standard response from all write endpoints
 */
export interface WriteResponse {
  /** 64 hex character transaction hash */
  tx_hash: string;
  /** Some v1.29 write responses also expose the root post id */
  post_id?: string;
  /** 0 = success */
  code: number;
  /** Block height (often 0 initially for async broadcast) */
  height: number;
  /** Raw log message */
  raw_log: string;
}

/**
 * Report endpoint response (different from on-chain writes)
 */
export interface ReportResponse {
  success: boolean;
  id: number;
}

// ============================================
// Envelope Builder Types
// ============================================

/**
 * Parameters passed to canonical byte builders
 */
export interface EnvelopeParams {
  pubkey33: Uint8Array;
  lastBlockHashBytes: Uint8Array;
  difficulty: number;
  timestampMs: number;
  envelopeNonce: bigint;
}

/**
 * Input for building a signed envelope
 */
export interface BuildEnvelopeInput<TPayload extends Record<string, unknown>> {
  /** Wallet for signing */
  wallet: MirageWallet;
  /** Function to build canonical base bytes */
  baseBuilder: (params: EnvelopeParams & TPayload) => Uint8Array;
  /** Message-specific payload fields */
  payloadFields: TPayload;
  /** Whether to skip PoW (for paid tier operations like upgrade) */
  skipPoW?: boolean;
}

// ============================================
// PoW Progress Types
// ============================================

export interface PoWProgress {
  /** Number of attempts so far */
  attempts: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated total time in milliseconds */
  estimatedTotalMs: number;
}

export type PoWProgressCallback = (progress: PoWProgress) => void;

// ============================================
// Error Types
// ============================================

export class WriteApiError extends Error {
  constructor(
    message: string,
    public code: WriteErrorCode,
    public details?: string
  ) {
    super(message);
    this.name = "WriteApiError";
  }
}

export enum WriteErrorCode {
  NO_WALLET = "NO_WALLET",
  SIGNING_FAILED = "SIGNING_FAILED",
  POW_FAILED = "POW_FAILED",
  NETWORK_ERROR = "NETWORK_ERROR",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  TIMESTAMP_ERROR = "TIMESTAMP_ERROR",
  INSUFFICIENT_POW = "INSUFFICIENT_POW",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}
