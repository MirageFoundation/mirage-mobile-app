import {
  buildSignedReadParams,
  type SignedReadParams,
} from "@/src/api/signing/simple-sign";
import { walletService } from "@/src/services/wallet-service";
import {
  getHttpStatus,
  shouldRetrySignedContentRead,
} from "@/src/api/read/signed-content-read";

export class SignedCuratorReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignedCuratorReadError";
  }
}

export type CuratorReadProof = {
  viewer: string;
  pubkey: string;
  signature: string;
  timestamp: number;
  envelope_nonce: number;
};

export function shouldRetryCuratorRead<TError = unknown>(
  failureCount: number,
  error: TError,
): boolean {
  return shouldRetrySignedContentRead(failureCount, error);
}

export { getHttpStatus };

export async function buildSignedCuratorReadQuery(options: {
  viewer?: string | null;
}): Promise<CuratorReadProof> {
  const requested = String(options.viewer ?? "").trim().toLowerCase();
  if (!requested) {
    throw new SignedCuratorReadError("Viewer required for curator read");
  }

  const wallet = await walletService.getWallet();
  if (!wallet) {
    throw new SignedCuratorReadError("Wallet required for curator read");
  }

  const proof: SignedReadParams = buildSignedReadParams(wallet, "curator_read");
  if (proof.address !== requested) {
    throw new SignedCuratorReadError("Signed curator read viewer mismatch");
  }

  return {
    viewer: proof.address,
    pubkey: proof.pubkey,
    signature: proof.signature,
    timestamp: proof.timestamp,
    envelope_nonce: proof.envelope_nonce,
  };
}

export function omitAddressClaim(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...params };
  delete next.address;
  return next;
}
