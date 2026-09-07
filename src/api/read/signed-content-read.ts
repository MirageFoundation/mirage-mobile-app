import {
  buildSignedReadParams,
  type SignedReadAction,
  type SignedReadParams,
} from "@/src/api/signing/simple-sign";
import { walletService } from "@/src/services/wallet-service";
import { shouldRetryApiQuery } from "@/src/api/read-retry-policy";

const PROOF_FIELDS = [
  "pubkey",
  "signature",
  "timestamp",
  "envelope_nonce",
] as const;

type ProofField = (typeof PROOF_FIELDS)[number];

export type SignedContentReadAction = Extract<
  SignedReadAction,
  "get_posts" | "get_comments"
>;

export class SignedContentReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignedContentReadError";
  }
}

export function omitSignedProofFields<T extends Record<string, unknown>>(
  params: T,
): Omit<T, ProofField> {
  const next = { ...params };
  for (const field of PROOF_FIELDS) {
    delete next[field];
  }
  return next;
}

export async function buildSignedContentReadQuery(options: {
  address?: string | null;
  action: SignedContentReadAction;
}): Promise<SignedReadParams | Record<string, never>> {
  const requested = String(options.address ?? "").trim();
  if (!requested) {
    return {};
  }

  const wallet = await walletService.getWallet();
  if (!wallet) {
    throw new SignedContentReadError(
      "Wallet required for signed content read",
    );
  }

  const proof = buildSignedReadParams(wallet, options.action);
  if (proof.address !== requested.toLowerCase()) {
    throw new SignedContentReadError("Signed content read address mismatch");
  }

  return proof;
}

export function getHttpStatus(error: unknown): number | undefined {
  const candidate = error as {
    status?: unknown;
    response?: { status?: unknown };
  } | null;
  const status = candidate?.status ?? candidate?.response?.status;
  return typeof status === "number" ? status : undefined;
}

export function shouldRetrySignedContentRead<TError = unknown>(
  failureCount: number,
  error: TError,
): boolean {
  const status = getHttpStatus(error);
  if (
    (status !== undefined && status >= 300 && status < 400) ||
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404
  ) {
    return false;
  }
  return shouldRetryApiQuery(failureCount, error);
}

export async function withSignedContentReadParams<
  T extends Record<string, unknown>,
>(
  params: T | undefined,
  action: SignedContentReadAction,
): Promise<Record<string, unknown>> {
  const raw = omitSignedProofFields({ ...(params ?? {}) } as T & Record<string, unknown>);
  const requestedAddress =
    typeof raw.address === "string" ? raw.address : undefined;
  const proof = await buildSignedContentReadQuery({
    address: requestedAddress,
    action,
  });

  const rest = { ...raw };
  delete rest.address;
  return { ...rest, ...proof };
}
