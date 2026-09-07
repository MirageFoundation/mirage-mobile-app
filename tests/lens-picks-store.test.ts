// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clearAllLensPicks,
  clearLensPickOnJoinSuccess,
  getEncodedLensPicks,
  useLensPicksStore,
} from "../src/stores/lens-picks-store";

afterEach(() => {
  useLensPicksStore.getState().clearAll();
});

describe("session lens picks store", () => {
  test("isolates viewers and replaces the same community", () => {
    useLensPicksStore.getState().setPick({
      viewer: " MIRAGE1ABC ",
      community: "Bitcoin",
      lens: "raw",
    });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1abc",
      community: "bitcoin",
      lens: "default",
    });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1other",
      community: "ethereum",
      lens: "raw",
    });

    expect(getEncodedLensPicks("mirage1abc")).toBe("bitcoin:default");
    expect(getEncodedLensPicks("mirage1other")).toBe("ethereum:raw");
    expect(getEncodedLensPicks(undefined)).toBe("");
  });

  test("keeps selected_at monotonic and evicts the oldest 21st unique pick", () => {
    let now = 1_000;
    for (let index = 0; index < 20; index += 1) {
      useLensPicksStore.getState().setPick({
        viewer: "mirage1abc",
        community: `c${index}`,
        lens: "raw",
        now: now + index,
      });
    }
    useLensPicksStore.getState().setPick({
      viewer: "mirage1abc",
      community: "c20",
      lens: "default",
      now: 900,
    });

    const encoded = getEncodedLensPicks("mirage1abc");
    expect(encoded.split(",")).toHaveLength(20);
    expect(encoded).toContain("c20:default");
    expect(encoded).not.toContain("c0:raw");
  });

  test("clears a pick after join success without touching other viewers", () => {
    useLensPicksStore.getState().setPick({
      viewer: "mirage1abc",
      community: "bitcoin",
      lens: "raw",
    });
    useLensPicksStore.getState().setPick({
      viewer: "mirage1abc",
      community: "ethereum",
      lens: "default",
    });
    clearLensPickOnJoinSuccess("mirage1abc", "bitcoin");
    expect(getEncodedLensPicks("mirage1abc")).toBe("ethereum:default");
    clearAllLensPicks();
    expect(getEncodedLensPicks("mirage1abc")).toBe("");
  });

  test("is session-only and is not a persisted store", () => {
    const source = readFileSync(
      join(import.meta.dir, "../src/stores/lens-picks-store.ts"),
      "utf8",
    );
    expect(source).not.toContain("persist");
    expect(source).not.toContain("mmkv");
    expect(source).not.toContain("createJSONStorage");
    const ownership = readFileSync(
      join(import.meta.dir, "../src/stores/wallet-scoped-storage.ts"),
      "utf8",
    );
    expect(ownership).not.toContain("lens-picks");
  });
});
