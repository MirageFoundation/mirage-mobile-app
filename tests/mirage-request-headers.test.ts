// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { afterEach, describe, expect, test } from "bun:test";

import {
  MIRAGE_PLATFORM_HEADER,
  MIRAGE_VISITOR_HEADER,
  applyMirageIdentityToAxiosRequest,
  applyMirageRedirectGuard,
  configureMiragePlatformForTests,
  getMiragePlatform,
  getMirageRequestHeaders,
  isTrustedMirageApiDestination,
} from "../src/api/mirage-request-headers";
import { configureVisitorIdentityForTests } from "../src/services/visitor-identity";

afterEach(() => {
  configureMiragePlatformForTests();
  configureVisitorIdentityForTests(null);
});

describe("mirage request headers", () => {
  test("emits exact nonempty visitor and ios|android platform headers", () => {
    configureVisitorIdentityForTests({
      storage: {
        getString: () => "visitor-identity-1",
        set: () => undefined,
      },
      randomUUID: () => "should-not-run-xxxxxxxx",
    });
    configureMiragePlatformForTests("ios");

    expect(getMiragePlatform()).toBe("ios");
    expect(getMirageRequestHeaders()).toEqual({
      [MIRAGE_VISITOR_HEADER]: "visitor-identity-1",
      [MIRAGE_PLATFORM_HEADER]: "ios",
    });

    configureMiragePlatformForTests("web");
    expect(getMiragePlatform()).toBeNull();
    expect(getMirageRequestHeaders()).toEqual({
      [MIRAGE_VISITOR_HEADER]: "visitor-identity-1",
    });
  });

  test("never suffix-matches lookalike or third-party destinations", () => {
    const trusted = ["https://mirage.talk", "https://mirage.vote"];
    expect(isTrustedMirageApiDestination("https://mirage.talk/api/get_posts", trusted)).toBe(true);
    expect(isTrustedMirageApiDestination("https://mirage.talk/api/get_peers", trusted)).toBe(true);
    expect(isTrustedMirageApiDestination("https://mirage.vote/api/core/unregister_push_token", trusted)).toBe(true);
    expect(isTrustedMirageApiDestination("https://mirage.talk/get_peers", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://mirage.talk.evil.com/api/get_posts", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://notmirage.talk/api/get_posts", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://api.giphy.com/v1/gifs/search", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://api.redgifs.com/v2/auth/temporary", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://github.com/api/get_posts", trusted)).toBe(false);
    expect(isTrustedMirageApiDestination("https://imagedelivery.net/hash/id/public", trusted)).toBe(false);
  });

  test("applies identity only to trusted API destinations and preserves proofs", () => {
    configureVisitorIdentityForTests({
      storage: {
        getString: () => "visitor-identity-1",
        set: () => undefined,
      },
    });
    configureMiragePlatformForTests("ios");

    const trusted = ["https://mirage.talk"];
    const request = applyMirageIdentityToAxiosRequest({
      baseURL: "https://mirage.talk",
      url: "/api/get_posts",
      headers: { Accept: "application/json" },
      params: {
        pubkey: "proof-key",
        signature: "proof-sig",
        timestamp: 1,
        envelope_nonce: 2,
      },
    } as any, trusted);

    expect(request.headers[MIRAGE_VISITOR_HEADER]).toBe("visitor-identity-1");
    expect(request.headers[MIRAGE_PLATFORM_HEADER]).toBe("ios");
    expect(request.headers.Accept).toBe("application/json");
    expect(request.params).toEqual({
      pubkey: "proof-key",
      signature: "proof-sig",
      timestamp: 1,
      envelope_nonce: 2,
    });

    const thirdParty = applyMirageIdentityToAxiosRequest({
      url: "https://api.giphy.com/v1/gifs/search",
      headers: { [MIRAGE_VISITOR_HEADER]: "leaked", Accept: "application/json" },
    }, trusted);
    expect(thirdParty.headers[MIRAGE_VISITOR_HEADER]).toBeUndefined();
    expect(thirdParty.headers.Accept).toBe("application/json");
  });

  test("trusts explicit old-server cleanup and strips identity on untrusted redirects", () => {
    configureVisitorIdentityForTests({
      storage: {
        getString: () => "visitor-identity-1",
        set: () => undefined,
      },
    });
    configureMiragePlatformForTests("ios");

    const current = ["https://mirage.talk"];
    const cleanup = applyMirageIdentityToAxiosRequest({
      url: "https://mirage.vote/api/core/unregister_push_token",
      mirageTrustedOrigins: ["https://mirage.vote"],
      headers: {},
    }, current);
    expect(cleanup.headers[MIRAGE_VISITOR_HEADER]).toBe("visitor-identity-1");

    const headers = {
      [MIRAGE_VISITOR_HEADER]: "visitor-identity-1",
      [MIRAGE_PLATFORM_HEADER]: "ios",
    };
    applyMirageRedirectGuard({
      href: "https://evil.example/steal",
      headers,
    }, current);
    expect(headers[MIRAGE_VISITOR_HEADER]).toBeUndefined();
    expect(headers[MIRAGE_PLATFORM_HEADER]).toBeUndefined();
  });
});
