import { readFileSync } from "node:fs";
import { Transpiler } from "bun";
import { AuthSessionCoordinator } from "../../src/services/auth-session-coordinator.ts";
import * as transactions from "../../src/services/wallet-secure-transactions.ts";
import * as localSession from "../../src/services/wallet-local-session.ts";

export function loadInjectedModule(path, bindings, result, selectSource = (source) => source) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
    .replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];\n/gm, "")
    .replace(/^import\s+["'][^"']+["'];\n/gm, "")
    .replace(/^export /gm, "");
  const js = new Transpiler({ loader: "ts" }).transformSync(selectSource(source));
  return new Function(...Object.keys(bindings), `${js}\nreturn ${result};`)(...Object.values(bindings));
}

export function walletHarness() {
  const secure = new Map([["primary", "mnemonic:old"]]);
  const meta = { address: "old", publicKeyBase64: "public:old", createdAt: 1, hasUsername: true };
  const publicStorage = new Map([["meta", JSON.stringify(meta)]]);
  const calls = [];
  let derives = 0;
  const storage = {
    getString: (key) => publicStorage.get(key),
    getBoolean: (key) => publicStorage.get(key),
    set: (key, value) => { publicStorage.set(key, value); },
    remove: (key) => { publicStorage.delete(key); },
    contains: (key) => publicStorage.has(key),
  };
  const SecureStore = {
    getItemAsync: async (key) => { calls.push(["get", key]); return secure.get(key) ?? null; },
    setItemAsync: async (key, value) => { calls.push(["set", key]); secure.set(key, value); },
    deleteItemAsync: async (key) => { calls.push(["remove", key]); secure.delete(key); },
  };
  const authSessionCoordinator = new AuthSessionCoordinator();
  const service = loadInjectedModule("../../src/services/wallet-service.ts", {
    ...transactions,
    ...localSession,
    SecureStore,
    storage,
    authSessionCoordinator,
    Sentry: { captureException: () => {} },
    STORAGE_KEYS: {
      MNEMONIC_V2: "primary", MNEMONIC: "legacy", MNEMONIC_BACKUP: "backup",
      MNEMONIC_CANDIDATE: "candidate", WALLET_META: "meta", USER_LEVEL: "level", HAS_ONBOARDED: "onboarded",
    },
    generateMnemonic: () => "mnemonic:new",
    isValidMnemonic: (value) => value.startsWith("mnemonic:"),
    createWalletFromMnemonic: (mnemonic) => {
      derives += 1;
      if (!mnemonic.startsWith("mnemonic:")) throw new Error("Invalid fixture");
      return { mnemonic, address: mnemonic.slice(9), privateKey: new Uint8Array([1]) };
    },
    getPublicKeyBase64: (wallet) => `public:${wallet.address}`,
    WalletError: class extends Error {},
    WalletErrorCode: {},
    derivePrivateKey: () => new Uint8Array([1]),
    signCanonical: () => { calls.push(["sign"]); return new Uint8Array([2]); },
    b64encode: () => "signature",
  }, "walletService");
  return { service, secure, publicStorage, storage, SecureStore, calls, authSessionCoordinator, get derives() { return derives; } };
}
