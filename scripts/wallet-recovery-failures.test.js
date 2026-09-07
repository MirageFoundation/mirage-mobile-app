import { describe, expect, test } from "bun:test";
import { recoverWalletReplacement, replaceWalletTransaction } from "../src/services/wallet-secure-transactions.ts";

function harness(fail = () => {}) {
  const values = new Map([["primary", "mnemonic:old"]]);
  let metadata = { address: "old" };
  const calls = [];
  function operation(name, effect) {
    const index = calls.push(name) - 1;
    fail(name, "before", index);
    const result = effect();
    fail(name, "after", index);
    return result;
  }
  const options = {
    deriveAddress: (mnemonic) => mnemonic.slice(9),
    secureStore: {
      get: async (key) => operation(`get:${key}`, () => values.get(key) ?? null),
      set: async (key, value) => operation(`set:${key}`, () => { values.set(key, value); }),
      remove: async (key) => operation(`remove:${key}`, () => { values.delete(key); }),
    },
    metadataStore: {
      get: () => operation("metadata:get", () => metadata),
      set: (value) => operation("metadata:set", () => { metadata = value; }),
      remove: () => operation("metadata:remove", () => { metadata = null; }),
    },
    primaryKey: "primary", candidateKey: "candidate", backupKey: "backup",
  };
  return {
    values, calls, options,
    get metadata() { return metadata; },
    replace: () => replaceWalletTransaction({ ...options, prepare: () => ({ mnemonic: "mnemonic:new", address: "new", metadata: { address: "new" } }) }),
    recover: () => recoverWalletReplacement(options),
  };
}

const successful = harness();
await successful.replace();

describe("every replacement storage stage", () => {
  for (const [index, stage] of successful.calls.entries()) {
    for (const timing of ["before", "after"]) {
      test(`${index} ${stage} throws ${timing}: verified identity survives and recovery is idempotent`, async () => {
        const h = harness((_name, when, call) => {
          if (call === index && timing === when) throw new Error("Injected stage failure");
        });
        await h.replace().catch(() => {});
        expect(h.values.get("primary")).toBe(`mnemonic:${h.metadata.address}`);
        await h.recover();
        await h.recover();
        expect(h.values.get("primary")).toBe(`mnemonic:${h.metadata.address}`);
        expect(h.values.has("backup")).toBe(false);
        expect(h.values.has("candidate")).toBe(false);
      });
    }
  }
});

test("promotion plus rollback failure keeps the backup and candidate until verified recovery", async () => {
  let writes = 0;
  let injecting = true;
  const h = harness((name, timing) => {
    if (!injecting || name !== "set:primary") return;
    if (timing === "before") {
      writes += 1;
      if (writes === 2) throw new Error("Rollback failure");
    } else if (writes === 1) throw new Error("Promotion failure after mutation");
  });
  await expect(h.replace()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  expect(h.values.get("backup")).toBe("mnemonic:old");
  expect(h.values.get("candidate")).toBe("mnemonic:new");
  expect(h.values.get("primary")).toBe("mnemonic:new");
  expect(h.metadata.address).toBe("old");
  injecting = false;
  await h.recover();
  await h.recover();
  expect(h.values.get("primary")).toBe("mnemonic:old");
  expect(h.values.has("backup")).toBe(false);
});

test("ambiguous metadata after double failure remains fail-closed without deleting either signer", async () => {
  let writes = 0;
  let injecting = true;
  const h = harness((name, timing) => {
    if (!injecting || name !== "metadata:set") return;
    if (timing === "before") {
      writes += 1;
      if (writes === 2) throw new Error("Rollback metadata failed");
    } else if (writes === 1) throw new Error("Metadata committed then threw");
  });
  await expect(h.replace()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  injecting = false;
  await expect(h.recover()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  await expect(h.recover()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  expect(h.values.get("backup")).toBe("mnemonic:old");
  expect(h.values.get("candidate")).toBe("mnemonic:new");
});

for (const stage of ["set:primary", "get:primary", "remove:candidate", "remove:backup"]) {
  test(`recovery ${stage} failure retains a usable key and can be retried`, async () => {
    let injecting = true;
    const h = harness((name, timing) => {
      if (injecting && name === stage && timing === "after") throw new Error("Recovery failure");
    });
    h.values.set("primary", "mnemonic:new");
    h.values.set("backup", "mnemonic:old");
    h.values.set("candidate", "mnemonic:new");
    await expect(h.recover()).rejects.toThrow("Recovery failure");
    expect([...h.values.values()].includes("mnemonic:old")).toBe(true);
    injecting = false;
    await h.recover();
    await h.recover();
    expect(h.values.get("primary")).toBe("mnemonic:old");
  });
}

test("candidate-only uncommitted first wallet is retained for explicit recovery", async () => {
  const h = harness();
  h.values.clear();
  h.options.metadataStore.remove();
  h.values.set("candidate", "mnemonic:new");
  await expect(h.recover()).rejects.toMatchObject({ code: "wallet_recovery_required" });
  expect(h.values.get("candidate")).toBe("mnemonic:new");
});
