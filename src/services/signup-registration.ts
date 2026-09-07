import { getBootstrap } from "@/src/api/read/endpoints/bootstrap";
import { isPrebroadcastRegistrationRejection } from "@/src/domain/auth/registration-gate";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { setUsername } from "@/src/api/write/endpoints/username";
import type { PoWProgressCallback } from "@/src/api/write/signing";
import { apiClient } from "@/src/api/client";
import type { WalletMetadata } from "@/src/wallet";
import { authSessionCoordinator } from "./auth-session-coordinator";
import { walletService } from "./wallet-service";

type Checkpoint = NonNullable<WalletMetadata["signup"]>;
export const SIGNUP_PENDING_MESSAGE = "Registration is not yet verified. Your recovery key is retained on this device. Check again; do not reinstall or clear app data. No transaction will be resent.";
let active = false;

function currentOperation() {
  const session = authSessionCoordinator.current();
  const context = apiClient.getCurrentServerContext();
  const metadata = walletService.getWalletMetadata();
  if (!metadata?.pending || !authSessionCoordinator.matches(session, metadata.address)) {
    throw new Error("No current pending signup wallet");
  }
  const signup = metadata.signup ?? {
    phase: "registering" as const,
    operationId: `legacy:${metadata.address}`,
  };
  const check = () => {
    const live = walletService.getWalletMetadata();
    if ((live?.signup?.operationId ?? `legacy:${live?.address}`) !== signup.operationId ||
        !authSessionCoordinator.matches(session, metadata.address) ||
        apiClient.getCurrentServerContext().generation !== context.generation ||
        walletService.getWalletMetadata()?.address !== metadata.address ||
        !walletService.getWalletMetadata()?.pending) {
      throw new Error("Signup session changed. Resume from the current account.");
    }
  };
  const save = (next: Checkpoint) => {
    check();
    walletService.updateMetadata({ signup: next, hasUsername: next.phase === "confirmed" });
    if (JSON.stringify(walletService.getWalletMetadata()?.signup) !== JSON.stringify(next)) {
      throw new Error("Unable to save registration progress. Keep this device and recovery key.");
    }
  };
  return { metadata, signup, check, save };
}

export async function registerPendingUsername(username: string, onProgress?: PoWProgressCallback) {
  if (active) throw new Error("Registration is already running");
  active = true;
  let mayHaveBroadcast = false;
  try {
    const { signup, check, save } = currentOperation();
    if (signup.phase !== "wallet_generated") throw new Error(SIGNUP_PENDING_MESSAGE);
    const next: Checkpoint = {
      phase: "registering", operationId: signup.operationId,
      username, server: apiClient.getCurrentServerContext().baseUrl,
    };
    save(next);
    try {
      const wallet = await walletService.getWallet();
      check();
      if (!wallet) throw new Error("Pending wallet unavailable");
      return await setUsername(wallet, { username }, onProgress, {
        beforeBroadcast: () => { check(); mayHaveBroadcast = true; },
        onSubmitted: (txHash) => {
          if (!txHash) throw new Error(SIGNUP_PENDING_MESSAGE);
          save({ ...next, phase: "submitted", txHash });
        },
      });
    } catch (error) {
      if (!mayHaveBroadcast || isPrebroadcastRegistrationRejection(error)) {
        save({ ...next, phase: "wallet_generated" });
      }
      throw error;
    }
  } finally {
    active = false;
  }
}

export async function reconcilePendingSignup(): Promise<string | null> {
  if (active) throw new Error("Registration is still running. Wait before checking.");
  active = true;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20_000);
  try {
    const { metadata, signup, check, save } = currentOperation();
    if (signup.phase === "wallet_generated") return null;
    if (signup.server && signup.server !== apiClient.getCurrentServerContext().baseUrl) {
      throw new Error(`Switch back to ${signup.server} to check this registration.`);
    }
    if (signup.phase === "confirmed" && signup.username) return signup.username;
    const status = await getBootstrap({ address: metadata.address }, { signal: abort.signal });
    check();
    const username = status.user_status?.username;
    if (username && (!signup.username || username.toLowerCase() === signup.username.toLowerCase() ||
        username.toLowerCase() === `anon-${signup.username.toLowerCase()}`)) {
      save({ ...signup, phase: "confirmed", username });
      return username;
    }
    if (signup.txHash) {
      const tx = await getTxStatus({ hash: signup.txHash }, { signal: abort.signal });
      check();
      if (tx.found && tx.indexed && tx.success === false) {
        save({ ...signup, phase: "wallet_generated", txHash: undefined });
        throw new Error("Registration was rejected on chain. Your wallet is retained; edit the username and retry.");
      }
    }
    throw new Error(SIGNUP_PENDING_MESSAGE);
  } finally {
    clearTimeout(timeout);
    active = false;
  }
}
