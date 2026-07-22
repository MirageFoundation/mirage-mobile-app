// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  buildDicebearSvgUrl,
  getAvatarImageFormat,
  getAvatarSourcePolicy,
  getAvatarSvgRenderKey,
} from "../src/components/atoms/avatar-source-policy";
import { AvatarSvgCache } from "../src/components/atoms/avatar-svg-cache";

describe("avatar source policy", () => {
  test("uses the shared DiceBear SVG URL without size-dependent output", () => {
    const small = getAvatarSourcePolicy(undefined, "Mirage user/1");
    const large = getAvatarSourcePolicy(undefined, "Mirage user/1");

    expect(small).toEqual(large);
    expect(small).toMatchObject({
      kind: "generated-svg",
      fallback: false,
      uri: "https://api.dicebear.com/9.x/identicon/svg?seed=Mirage%20user%2F1&backgroundColor=transparent",
    });
  });

  test("recognizes SVG and raster URLs while preserving opaque custom sources", () => {
    expect(getAvatarImageFormat("https://cdn.example/avatar.svg?v=1")).toBe("svg");
    expect(getAvatarImageFormat("https://cdn.example/avatar.webp?width=80")).toBe("raster");

    const source = { uri: "file:///avatars/user.bin" };
    expect(getAvatarSourcePolicy(source, "ignored")).toEqual({
      kind: "custom",
      format: "unknown",
      source,
    });
  });

  test("uses the stable default seed for missing and empty fallback seeds", () => {
    expect(buildDicebearSvgUrl(undefined)).toBe(buildDicebearSvgUrl(""));
    expect(getAvatarSourcePolicy(undefined, undefined)).toMatchObject({
      kind: "generated-svg",
      fallback: true,
    });
  });

  test("keys parsed SVGs by URL and rendered ownership by exact size", () => {
    const policy = getAvatarSourcePolicy(undefined, "same-user");
    if (policy.kind !== "generated-svg") throw new Error("Expected generated SVG");

    expect(policy.cacheKey).toBe(policy.uri);
    expect(getAvatarSvgRenderKey(policy.cacheKey, 24)).not.toBe(
      getAvatarSvgRenderKey(policy.cacheKey, 48),
    );
  });
});

describe("avatar SVG cache", () => {
  test("deduplicates fetch and parse work for identical mounted avatars", async () => {
    const cache = new AvatarSvgCache(2, 2);
    let fetches = 0;
    let parses = 0;
    const fetchXml = async () => {
      fetches += 1;
      return "<svg />";
    };
    const parseXml = (xml: string) => {
      parses += 1;
      return { xml };
    };

    const [first, second] = await Promise.all([
      cache.load("avatar", fetchXml, parseXml),
      cache.load("avatar", fetchXml, parseXml),
    ]);
    const third = await cache.load("avatar", fetchXml, parseXml);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(fetches).toBe(1);
    expect(parses).toBe(1);
  });

  test("evicts least-recently-used parsed owners and retries evicted entries", async () => {
    const evicted: string[] = [];
    const cache = new AvatarSvgCache(2, 2, (key) => evicted.push(key));
    let fetches = 0;
    const load = (key: string) => cache.load(
      key,
      async () => {
        fetches += 1;
        return key;
      },
      (xml) => ({ xml }),
    );

    const mountedOwner = await load("a");
    await load("b");
    cache.get("a");
    await load("c");
    await load("b");

    expect(evicted).toEqual(["b", "a"]);
    expect(mountedOwner).toEqual({ xml: "a" });
    expect(fetches).toBe(4);
    expect(cache.size).toBe(2);
  });

  test("cleans failed in-flight work so a later request can retry", async () => {
    const cache = new AvatarSvgCache(2, 2);
    let attempts = 0;
    const fetchXml = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return "<svg />";
    };

    await expect(cache.load("avatar", fetchXml, (xml) => xml)).rejects.toThrow("offline");
    expect(cache.inflightSize).toBe(0);
    await expect(cache.load("avatar", fetchXml, (xml) => xml)).resolves.toBe("<svg />");
    expect(attempts).toBe(2);
  });
});
