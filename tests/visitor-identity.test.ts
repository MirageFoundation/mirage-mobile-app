// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  VISITOR_ID_STORAGE_KEY,
  configureVisitorIdentityForTests,
  getVisitorId,
  resetVisitorIdentityMemoForTests,
} from "../src/services/visitor-identity";

function memoryStorage(records = new Map<string, string>()) {
  return {
    records,
    getString: (key: string) => records.get(key),
    set: (key: string, value: string) => {
      records.set(key, value);
    },
  };
}

afterEach(() => {
  configureVisitorIdentityForTests(null);
});

describe("visitor identity", () => {
  test("is available on the first request without a provider", () => {
    configureVisitorIdentityForTests({
      storage: memoryStorage(),
      randomUUID: () => "11111111-2222-3333-4444-555555555555",
    });
    expect(getVisitorId()).toBe("11111111-2222-3333-4444-555555555555");
  });

  test("memoizes before write and stays stable across reload, logout, wallet, and server", () => {
    const storage = memoryStorage();
    let created = 0;
    configureVisitorIdentityForTests({
      storage,
      randomUUID: () => {
        created += 1;
        return `id-${created}-aaaaaaaa`;
      },
    });

    const first = getVisitorId();
    expect(first).toBe("id-1-aaaaaaaa");
    expect(storage.records.get(VISITOR_ID_STORAGE_KEY)).toBe(first);
    expect(getVisitorId()).toBe(first);

    resetVisitorIdentityMemoForTests();
    expect(getVisitorId()).toBe(first);
    expect(created).toBe(1);
  });

  test("uses one in-memory id when storage acquisition fails", () => {
    let created = 0;
    configureVisitorIdentityForTests({
      storage: () => {
        throw new Error("mmkv unavailable");
      },
      randomUUID: () => {
        created += 1;
        return `mem-${created}-bbbbbbbb`;
      },
    });

    const first = getVisitorId();
    expect(first).toBe("mem-1-bbbbbbbb");
    expect(getVisitorId()).toBe(first);

    resetVisitorIdentityMemoForTests();
    expect(getVisitorId()).toBe("mem-2-bbbbbbbb");
    expect(created).toBe(2);
  });

  test("survives getString failure and does not claim persistence after set failure", () => {
    let created = 0;
    configureVisitorIdentityForTests({
      storage: {
        getString: () => {
          throw new Error("read failed");
        },
        set: () => {
          throw new Error("write failed");
        },
      },
      randomUUID: () => {
        created += 1;
        return `tmp-${created}-cccccccc`;
      },
    });

    const first = getVisitorId();
    expect(first).toBe("tmp-1-cccccccc");
    expect(getVisitorId()).toBe(first);

    resetVisitorIdentityMemoForTests();
    expect(getVisitorId()).toBe("tmp-2-cccccccc");
  });

  test("does not import wallet, auth, API, or analytics", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/services/visitor-identity.ts"),
      "utf8",
    );
    expect(source).not.toContain("wallet-service");
    expect(source).not.toContain("auth-store");
    expect(source).not.toContain("api/client");
    expect(source).not.toContain("services/analytics");
    expect(source).toContain(VISITOR_ID_STORAGE_KEY);
  });
});
