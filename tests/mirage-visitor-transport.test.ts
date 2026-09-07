// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyMirageIdentityToAxiosRequest,
  configureMiragePlatformForTests,
  MIRAGE_PLATFORM_HEADER,
  MIRAGE_VISITOR_HEADER,
} from "../src/api/mirage-request-headers";
import {
  ServerRequestCoordinator,
  StaleServerResponseError,
} from "../src/api/server-runtime";
import { configureVisitorIdentityForTests } from "../src/services/visitor-identity";

function source(relativePath: string): string {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("first-party visitor transport", () => {
  test("uses the fixed peer discovery API URL with explicit identity headers", () => {
    const peers = source("../src/hooks/use-server-list.ts");
    expect(peers).toContain("https://mirage.talk/api/get_peers");
    expect(peers).toContain("getMirageRequestHeaders");
    expect(peers).not.toContain("https://mirage.talk/get_peers\"");
  });

  test("ApiClient interceptor covers get/post retries and old-server cleanup without global axios/fetch", () => {
    const client = source("../src/api/client.ts");
    expect(client).toContain("applyMirageIdentityToAxiosRequest");
    expect(client).toContain("interceptors.request.use");
    expect(client).toContain("maxRedirects: 0");
    expect(client).toContain("runExternalWrite");
    expect(client).toContain("postTrustedAbsolute");
    expect(client).not.toContain("axios.defaults");
    expect(client).not.toContain("globalThis.fetch");

    const unregister = source("../src/api/write/endpoints/push-token.ts");
    expect(unregister).toContain("postTrustedAbsolute");
    expect(unregister).toContain("/api/core/unregister_push_token");
  });

  test("native image and video retries share one upload seam with identity headers and write context", () => {
    const media = source("../src/api/read/endpoints/media.ts");
    expect(media).toContain("runExternalWrite");
    expect(media).toContain("assertCurrentServerContext");
    expect(media).toContain("createNativeMediaUploadOptions");
    expect(media).toContain("getMirageRequestHeaders");
    expect(media).toContain("backgroundUpload(");
    expect(media.match(/backgroundUpload\(/g)?.length).toBe(1);
    expect(media).toContain("await uploadMedia(");
    expect(media).toContain("StaleServerResponseError");
    expect(media).not.toContain("headers: {}");
    expect(media).not.toContain("Content-Type");

    expect(media).toContain("export async function uploadImage");
    expect(media).toContain("export async function uploadVideo");
    expect(media.match(/await uploadMedia\(/g)?.length).toBe(2);
  });

  test("third-party transports do not inherit identity helpers", () => {
    const thirdParty = [
      "../src/api/giphy.ts",
      "../src/api/read/endpoints/redgifs.ts",
      "../src/utils/fetch-link-meta.ts",
      "../src/utils/hls-manifest.ts",
      "../src/components/atoms/avatar.tsx",
      "../src/providers/update-provider.tsx",
      "../src/services/analytics.ts",
      "../src/services/sentry.ts",
    ];
    for (const file of thirdParty) {
      const text = source(file);
      expect(text, file).not.toContain("X-Mirage-Visitor");
      expect(text, file).not.toContain("getMirageRequestHeaders");
      expect(text, file).not.toContain("mirage-request-headers");
    }
  });

  test("retries keep identity headers and do not silently follow an untrusted URL", () => {
    configureVisitorIdentityForTests({
      storage: {
        getString: () => "visitor-identity-1",
        set: () => undefined,
      },
    });
    configureMiragePlatformForTests("ios");
    const config = {
      baseURL: "https://mirage.talk",
      url: "/api/get_posts",
      headers: { "X-Retry": "true" },
    };
    applyMirageIdentityToAxiosRequest(config, ["https://mirage.talk"]);
    applyMirageIdentityToAxiosRequest(config, ["https://mirage.talk"]);
    expect(config.headers[MIRAGE_VISITOR_HEADER]).toBe("visitor-identity-1");
    expect(config.headers[MIRAGE_PLATFORM_HEADER]).toBe("ios");
    expect(config.headers["X-Retry"]).toBe("true");
  });

  test("native write context rejects stale results and waits out switches", async () => {
    const coordinator = new ServerRequestCoordinator("https://a.example");
    const events: string[] = [];
    let finishWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });

    const write = coordinator.runWrite(async (context) => {
      events.push(`upload:${context.identity}`);
      await writeGate;
      coordinator.assertCurrent(context);
      return context.identity;
    });
    const switching = coordinator.switchServer("https://b.example");

    await Promise.resolve();
    expect(events).toEqual(["upload:https://a.example"]);
    finishWrite();
    await expect(write).resolves.toBe("https://a.example");
    await switching;
    expect(coordinator.getContext().identity).toBe("https://b.example");

    const stale = coordinator.getContext();
    coordinator.replaceImmediately("https://c.example");
    expect(() => coordinator.assertCurrent(stale)).toThrow(StaleServerResponseError);
  });
});
