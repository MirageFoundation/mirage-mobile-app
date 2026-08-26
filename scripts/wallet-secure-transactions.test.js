import { describe, expect, test } from "bun:test";

import {
  migrateWalletAccessibility,
  recoverWalletReplacement,
  replaceWalletTransaction,
} from "../src/services/wallet-secure-transactions.ts";

const keys = {
  primary: "primary",
  candidate: "candidate",
  backup: "backup",
  legacy: "legacy",
};

const addressFor = (mnemonic) => {
  if (!mnemonic?.startsWith("mnemonic:")) throw new Error("invalid mnemonic");
  return mnemonic.slice("mnemonic:".length);
};

function createHarness() {
  const values = new Map([[keys.primary, "mnemonic:old"]]);
  let metadata = { address: "old" };
  const calls = [];
  return {
    values,
    calls,
    get metadata() {
      return metadata;
    },
    secureStore: {
      get: async (key) => {
        calls.push(["get", key]);
        return values.get(key) ?? null;
      },
      set: async (key, value) => {
        calls.push(["set", key, value]);
        values.set(key, value);
      },
      remove: async (key) => {
        calls.push(["remove", key]);
        values.delete(key);
      },
    },
    metadataStore: {
      get: () => metadata,
      set: (value) => {
        metadata = value;
      },
      remove: () => {
        metadata = null;
      },
    },
  };
}

function replace(harness, overrides = {}) {
  return replaceWalletTransaction({
    prepare: () => ({
      mnemonic: "mnemonic:new",
      address: "new",
      metadata: { address: "new" },
    }),
    deriveAddress: addressFor,
    secureStore: harness.secureStore,
    metadataStore: harness.metadataStore,
    primaryKey: keys.primary,
    candidateKey: keys.candidate,
    backupKey: keys.backup,
    ...overrides,
  });
}

function expectOldWallet(harness) {
  expect(harness.values.get(keys.primary)).toBe("mnemonic:old");
  expect(harness.metadata).toEqual({ address: "old" });
  expect(harness.values.has(keys.candidate)).toBe(false);
  expect(harness.values.has(keys.backup)).toBe(false);
}

describe("wallet replacement transaction", () => {
  test("does no storage I/O when candidate preparation fails", async () => {
    const harness = createHarness();
    await expect(replace(harness, {
      prepare: () => {
        throw new Error("invalid candidate");
      },
    })).rejects.toThrow("invalid candidate");
    expect(harness.calls).toEqual([]);
    expectOldWallet(harness);
  });

  test("preserves the old wallet when candidate readback mismatches", async () => {
    const harness = createHarness();
    const get = harness.secureStore.get;
    harness.secureStore.get = async (key) => (
      key === keys.candidate ? "mnemonic:wrong" : get(key)
    );
    await expect(replace(harness)).rejects.toThrow("verification failed");
    expectOldWallet(harness);
  });

  test("preserves the old wallet when backup write fails", async () => {
    const harness = createHarness();
    const set = harness.secureStore.set;
    harness.secureStore.set = async (key, value) => {
      if (key === keys.backup) throw new Error("backup failed");
      return set(key, value);
    };
    await expect(replace(harness)).rejects.toThrow("backup failed");
    expectOldWallet(harness);
  });

  test("rolls back a primary write that mutates before throwing", async () => {
    const harness = createHarness();
    const set = harness.secureStore.set;
    let primaryWrites = 0;
    harness.secureStore.set = async (key, value) => {
      await set(key, value);
      if (key === keys.primary && primaryWrites++ === 0) {
        throw new Error("promote failed after write");
      }
    };
    await expect(replace(harness)).rejects.toThrow("promote failed after write");
    expectOldWallet(harness);
  });

  test("rolls back primary and metadata when metadata commit fails", async () => {
    const harness = createHarness();
    const set = harness.metadataStore.set;
    harness.metadataStore.set = (metadata) => {
      set(metadata);
      if (metadata.address === "new") throw new Error("metadata failed");
    };
    await expect(replace(harness)).rejects.toThrow("metadata failed");
    expectOldWallet(harness);
  });
});

describe("wallet replacement crash recovery", () => {
  test("restores the backup when promotion outlives the metadata commit", async () => {
    const harness = createHarness();
    harness.values.set(keys.primary, "mnemonic:new");
    harness.values.set(keys.candidate, "mnemonic:new");
    harness.values.set(keys.backup, "mnemonic:old");

    await recoverWalletReplacement({
      deriveAddress: addressFor,
      secureStore: harness.secureStore,
      metadataStore: harness.metadataStore,
      primaryKey: keys.primary,
      candidateKey: keys.candidate,
      backupKey: keys.backup,
    });
    expectOldWallet(harness);
  });

  test("keeps a committed wallet and only removes transaction residue", async () => {
    const harness = createHarness();
    harness.values.set(keys.primary, "mnemonic:new");
    harness.values.set(keys.candidate, "mnemonic:new");
    harness.values.set(keys.backup, "mnemonic:old");
    harness.metadataStore.set({ address: "new" });

    await recoverWalletReplacement({
      deriveAddress: addressFor,
      secureStore: harness.secureStore,
      metadataStore: harness.metadataStore,
      primaryKey: keys.primary,
      candidateKey: keys.candidate,
      backupKey: keys.backup,
    });
    expect(harness.values.get(keys.primary)).toBe("mnemonic:new");
    expect(harness.metadata).toEqual({ address: "new" });
    expect(harness.values.has(keys.candidate)).toBe(false);
    expect(harness.values.has(keys.backup)).toBe(false);
  });
});

describe("wallet accessibility migration", () => {
  test("keeps legacy data and flag unset when the new write fails", async () => {
    const harness = createHarness();
    harness.values.clear();
    harness.values.set(keys.legacy, "mnemonic:old");
    harness.secureStore.set = async () => {
      throw new Error("migration write failed");
    };
    let migrated = false;

    await expect(migrateWalletAccessibility({
      deriveAddress: addressFor,
      secureStore: harness.secureStore,
      legacyKey: keys.legacy,
      primaryKey: keys.primary,
      setMigrated: () => {
        migrated = true;
      },
    })).rejects.toThrow("migration write failed");
    expect(harness.values.get(keys.legacy)).toBe("mnemonic:old");
    expect(harness.values.has(keys.primary)).toBe(false);
    expect(migrated).toBe(false);
  });

  test("keeps both verified copies and flag unset when legacy delete fails", async () => {
    const harness = createHarness();
    harness.values.clear();
    harness.values.set(keys.legacy, "mnemonic:old");
    const remove = harness.secureStore.remove;
    harness.secureStore.remove = async (key) => {
      if (key === keys.legacy) throw new Error("migration delete failed");
      return remove(key);
    };
    let migrated = false;

    await expect(migrateWalletAccessibility({
      deriveAddress: addressFor,
      secureStore: harness.secureStore,
      legacyKey: keys.legacy,
      primaryKey: keys.primary,
      setMigrated: () => {
        migrated = true;
      },
    })).rejects.toThrow("migration delete failed");
    expect(harness.values.get(keys.legacy)).toBe("mnemonic:old");
    expect(harness.values.get(keys.primary)).toBe("mnemonic:old");
    expect(migrated).toBe(false);
  });
});
