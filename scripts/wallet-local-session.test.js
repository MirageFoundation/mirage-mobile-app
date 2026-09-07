import { describe, expect, test } from "bun:test";
import { walletHarness, loadInjectedModule } from "./fixtures/wallet-service-harness.js";

const tombstone = "wallet_cleanup_pending_v1";

describe("local wallet identity restoration", () => {
  test("concurrent startup derives once, reads each secure slot once, and reuses validated memory", async () => {
    const h = walletHarness();
    await Promise.all(Array.from({ length: 10 }, () => h.service.initializeLocalWallet()));
    expect(h.derives).toBe(1);
    expect(h.calls).toEqual([["get", "candidate"], ["get", "backup"], ["get", "primary"], ["get", "legacy"]]);
    await Promise.all(Array.from({ length: 10 }, () => h.service.getWallet()));
    expect(h.derives).toBe(1);
    expect(h.calls).toHaveLength(4);
  });

  for (const variant of ["address", "publicKey", "missingMetadata", "missingKey"]) {
    test(`fails closed without deleting keys for ${variant}`, async () => {
      const h = walletHarness();
      if (variant === "address") h.publicStorage.set("meta", JSON.stringify({ address: "other", publicKeyBase64: "public:old" }));
      if (variant === "publicKey") h.publicStorage.set("meta", JSON.stringify({ address: "old", publicKeyBase64: "public:other" }));
      if (variant === "missingMetadata") h.publicStorage.delete("meta");
      if (variant === "missingKey") h.secure.delete("primary");
      await expect(h.service.initializeLocalWallet()).rejects.toMatchObject({ code: "wallet_recovery_required" });
      await expect(h.service.getWallet()).rejects.toMatchObject({ code: "wallet_recovery_required" });
      expect(h.calls.some(([operation]) => operation === "remove")).toBe(false);
      expect(h.service.cachedWallet).toBeNull();
    });
  }

  test("conflicting legacy key is retained instead of discarded", async () => {
    const h = walletHarness();
    h.secure.set("legacy", "mnemonic:other");
    await expect(h.service.initializeLocalWallet()).rejects.toMatchObject({ code: "wallet_recovery_required" });
    expect(h.secure.get("legacy")).toBe("mnemonic:other");
    expect(h.secure.get("primary")).toBe("mnemonic:old");
  });

  test("a delayed getWallet cannot return or cache a previous auth generation", async () => {
    const h = walletHarness();
    h.authSessionCoordinator.begin("old");
    const pending = h.service.getWallet();
    h.authSessionCoordinator.begin("new");
    await expect(pending).rejects.toMatchObject({ code: "wallet_recovery_required" });
    expect(h.service.cachedWallet).toBeNull();
  });

  test("shared hook rejects an old render address and an async account switch", async () => {
    const h = walletHarness();
    let address = "old";
    h.authSessionCoordinator.begin(address);
    const store = (selector) => selector({ walletAddress: address });
    store.getState = () => ({ walletAddress: address });
    const useWallet = loadInjectedModule("../../src/hooks/use-wallet.ts", {
      useCallback: (callback) => callback,
      useState: () => [false, () => {}],
      useAuthStore: store,
      walletService: h.service,
      authSessionCoordinator: h.authSessionCoordinator,
    }, "useWallet");
    const hook = useWallet();
    const pending = hook.getWallet();
    h.authSessionCoordinator.begin("new");
    address = "new";
    await expect(pending).rejects.toThrow("session changed");
    await expect(hook.getWallet()).rejects.toThrow("No wallet connected");
  });
});

describe("durable intentional wallet cleanup", () => {
  for (const key of ["primary", "candidate", "backup", "legacy"]) {
    test(`failed ${key} deletion empties signing caches and blocks restoration until retry`, async () => {
      const h = walletHarness();
      await h.service.getWallet();
      h.secure.set(key, "mnemonic:old");
      h.publicStorage.set("visitor", "keep");
      const remove = h.SecureStore.deleteItemAsync;
      h.SecureStore.deleteItemAsync = async (candidate) => {
        if (candidate === key) throw new Error("Injected delete failure");
        return remove(candidate);
      };
      await expect(h.service.clearWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
      expect(h.service.cachedWallet).toBeNull();
      expect(h.service.cachedMnemonic).toBeNull();
      expect(h.publicStorage.get(tombstone)).toBe(true);
      await expect(h.service.getWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
      await expect(h.service.initializeLocalWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
      h.SecureStore.deleteItemAsync = remove;
      expect(await h.service.initializeLocalWallet()).toBeNull();
      expect(h.secure.size).toBe(0);
      expect(h.publicStorage.has(tombstone)).toBe(false);
      expect(h.publicStorage.get("visitor")).toBe("keep");
    });
  }

  test("a fresh process honors a tombstone and never restores the remaining key", async () => {
    const h = walletHarness();
    h.publicStorage.set(tombstone, true);
    h.SecureStore.deleteItemAsync = async () => { throw new Error("Unavailable"); };
    await expect(h.service.initializeLocalWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
    expect(h.derives).toBe(0);
    expect(h.service.cachedWallet).toBeNull();
  });

  test("total MMKV write failure invalidates memory, performs no deletion, and reports retry", async () => {
    const h = walletHarness();
    await h.service.getWallet();
    h.storage.set = () => { throw new Error("Unavailable"); };
    await expect(h.service.clearWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
    expect(h.service.cachedWallet).toBeNull();
    expect(h.service.cachedMnemonic).toBeNull();
    expect(h.secure.get("primary")).toBe("mnemonic:old");
    expect(h.calls.some(([operation]) => operation === "remove")).toBe(false);
    await expect(h.service.getWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
  });

  test("metadata deletion failure retains cleanup intent until a successful retry", async () => {
    const h = walletHarness();
    const remove = h.storage.remove;
    h.storage.remove = (key) => { if (key === "meta") throw new Error("Unavailable"); remove(key); };
    await expect(h.service.clearWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
    expect(h.publicStorage.get(tombstone)).toBe(true);
    h.storage.remove = remove;
    await h.service.clearWallet();
    expect(h.publicStorage.has(tombstone)).toBe(false);
  });

  test("cleanup serializes behind a delayed migration so it cannot resurrect keys", async () => {
    const h = walletHarness();
    h.secure.delete("primary");
    h.secure.set("legacy", "mnemonic:old");
    let release;
    let entered;
    const writing = new Promise((resolve) => { entered = resolve; });
    const blocked = new Promise((resolve) => { release = resolve; });
    const set = h.SecureStore.setItemAsync;
    h.SecureStore.setItemAsync = async (key, value) => { entered(); await blocked; return set(key, value); };
    const startup = h.service.initializeLocalWallet().catch((error) => error);
    await writing;
    const cleanup = h.service.clearWallet();
    release();
    expect(await startup).toMatchObject({ code: "wallet_recovery_required" });
    await cleanup;
    expect(h.secure.size).toBe(0);
    expect(await h.service.getWallet()).toBeNull();
  });
});

for (const action of ["getWallet", "signData"]) {
  test(`cached ${action} rejects an async auth or service generation change`, async () => {
    for (const change of ["auth", "service"]) {
      const h = walletHarness();
      h.authSessionCoordinator.begin("old");
      await h.service.getWallet();
      const pending = h.service[action](new Uint8Array([1]));
      if (change === "auth") h.authSessionCoordinator.begin("new");
      else h.service.invalidateSession();
      await expect(pending).rejects.toMatchObject({ code: "wallet_recovery_required" });
      expect(h.calls.some(([operation]) => operation === "sign")).toBe(false);
    }
  });
}

test("signing reuses the validated key without another derivation or secure read", async () => {
  const h = walletHarness();
  await h.service.getWallet();
  await h.service.signData(new Uint8Array([1]));
  await h.service.signData(new Uint8Array([2]));
  expect(h.derives).toBe(1);
  expect(h.calls.filter(([operation]) => operation === "get")).toHaveLength(4);
});

test("concurrent tombstone startup retries share one cleanup", async () => {
  const h = walletHarness();
  h.publicStorage.set(tombstone, true);
  const results = await Promise.all(Array.from({ length: 5 }, () => h.service.initializeLocalWallet()));
  expect(results).toEqual([null, null, null, null, null]);
  expect(h.calls.filter(([operation]) => operation === "remove")).toHaveLength(4);
});

for (const stage of ["secureReadback", "silentDelete", "metadataSilentDelete", "tombstoneDelete"]) {
  test(`${stage} failure leaves cleanup intent and memory fail-closed`, async () => {
    const h = walletHarness();
    await h.service.getWallet();
    const get = h.SecureStore.getItemAsync;
    const remove = h.SecureStore.deleteItemAsync;
    const removePublic = h.storage.remove;
    if (stage === "secureReadback") h.SecureStore.getItemAsync = async (key) => { if (key === "primary") throw new Error("Unavailable"); return get(key); };
    if (stage === "silentDelete") h.SecureStore.deleteItemAsync = async (key) => { if (key !== "primary") await remove(key); };
    if (stage === "metadataSilentDelete") h.storage.remove = (key) => { if (key !== "meta") removePublic(key); };
    if (stage === "tombstoneDelete") h.storage.remove = (key) => { if (key === tombstone) throw new Error("Unavailable"); removePublic(key); };
    await expect(h.service.clearWallet()).rejects.toMatchObject({ code: "wallet_cleanup_incomplete" });
    expect(h.service.cachedWallet).toBeNull();
    expect(h.publicStorage.get(tombstone)).toBe(true);
    h.SecureStore.getItemAsync = get;
    h.SecureStore.deleteItemAsync = remove;
    h.storage.remove = removePublic;
    await h.service.clearWallet();
    expect(h.publicStorage.has(tombstone)).toBe(false);
  });
}
