import { expect, test } from "bun:test";
import { walletHarness } from "./fixtures/wallet-service-harness.js";

function emptyHarness() {
  const h = walletHarness();
  h.secure.clear();
  h.publicStorage.delete("meta");
  return h;
}

test("first creation verifies secure persistence and preserves pending signup metadata", async () => {
  const h = emptyHarness();
  const metadata = await h.service.createWallet();
  expect(metadata).toMatchObject({ address: "new", publicKeyBase64: "public:new", pending: true, hasUsername: false });
  expect(h.secure.get("primary")).toBe("mnemonic:new");
  expect(await h.service.exportMnemonic()).toBe("mnemonic:new");
  expect(h.secure.has("candidate")).toBe(false);
});

for (const key of ["candidate", "primary"]) {
  test(`first creation cannot succeed if ${key} silently fails to persist`, async () => {
    const h = emptyHarness();
    const set = h.SecureStore.setItemAsync;
    h.SecureStore.setItemAsync = async (target, value) => { if (target !== key) await set(target, value); };
    await expect(h.service.createWallet()).rejects.toThrow("verification failed");
    expect(h.service.cachedWallet).toBeNull();
    expect(h.publicStorage.has("meta")).toBe(false);
    expect(h.secure.size).toBe(0);
  });
}

test("first creation retains its candidate if primary promotion and removal both fail", async () => {
  const h = emptyHarness();
  const set = h.SecureStore.setItemAsync;
  h.SecureStore.setItemAsync = async (key, value) => { await set(key, value); if (key === "primary") throw new Error("Promotion failed"); };
  const remove = h.SecureStore.deleteItemAsync;
  h.SecureStore.deleteItemAsync = async (key) => { if (key === "primary") throw new Error("Rollback failed"); await remove(key); };
  await expect(h.service.createWallet()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  expect(h.secure.get("candidate")).toBe("mnemonic:new");
  expect(h.secure.get("primary")).toBe("mnemonic:new");
  expect(h.service.cachedWallet).toBeNull();
});
