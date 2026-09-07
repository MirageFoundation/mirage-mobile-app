// @ts-nocheck -- Bun's test types are runtime-provided.
import { describe, expect, test } from "bun:test";
import axios from "axios";
import { readFileSync } from "node:fs";
import { createJsonTransport, isRedirectError } from "../src/api/json-transport";

describe("installed Axios injected JSON fetch adapter", () => {
  test("real client uses lazy Expo seam for identity, retries, redirects and server cancellation", () => {
    const result = Bun.spawnSync([process.execPath, "--no-env-file", "tests/fixtures/json-transport-runtime.ts"], {
      stdout: "pipe", stderr: "pipe",
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("isolated native-fetch seam checks passed");
  });
  test("passes URL/options directly, manual redirect, serialized proof/body and headers", async () => {
    const calls = [];
    const client = axios.create({ adapter: createJsonTransport(async (...args) => {
      calls.push(args);
      return new Response('{"ok":true}', { status: 200 });
    }) });
    const response = await client.post("https://mirage.talk/api/test", { signature: "fixture" }, {
      params: { values: [1, 2] }, headers: { "X-Mirage-Visitor": "fixture" },
      fetchOptions: { redirect: "follow" },
    });
    expect(response.data).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("https://mirage.talk/api/test?values%5B%5D=1&values%5B%5D=2");
    expect(calls[0][1].redirect).toBe("manual");
    expect(calls[0][1].body).toBe('{"signature":"fixture"}');
    expect(calls[0][1].headers["X-Mirage-Visitor"]).toBe("fixture");
    expect(calls[0][1].signal).toBeUndefined();
  });

  for (const status of [300, 301, 302, 303, 304, 307, 308, 399]) {
    test(`${status} is terminal even with permissive validateStatus and retryable body`, async () => {
      let calls = 0;
      const client = axios.create({ adapter: createJsonTransport(async () => {
        calls++;
        return { status, statusText: "redirect", headers: new Headers({ location: "https://other.example" }),
          text: async () => '{"error_code":"network_error"}' };
      }), validateStatus: () => true });
      try { await client.get("https://mirage.talk/api/test"); throw Error("expected reject"); }
      catch (error) { expect(isRedirectError(error)).toBe(true); expect(error.response.status).toBe(status); }
      expect(calls).toBe(1);
    });
  }

  test("HTTP errors retain parsed bodies and status", async () => {
    const client = axios.create({ adapter: createJsonTransport(async () =>
      new Response('{"error_code":"fixture"}', { status: 429 })) });
    await client.get("https://mirage.talk/api/test").catch(error => {
      expect(error.response.status).toBe(429);
      expect(error.response.data).toEqual({ error_code: "fixture" });
      expect(isRedirectError(error)).toBe(false);
    });
  });

  test("abort and timeout remain active through response body consumption", async () => {
    const adapter = createJsonTransport(async (_url, options) => ({
      status: 200, statusText: "OK", headers: new Headers(),
      text: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      }),
    }));
    const client = axios.create({ adapter });
    await expect(client.get("https://mirage.talk/api/test", { timeout: 10 })).rejects.toMatchObject({ code: "ECONNABORTED" });
    const controller = new AbortController();
    const pending = client.get("https://mirage.talk/api/test", { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "ERR_CANCELED" });
    await expect(client.get("https://mirage.talk/api/test", { signal: controller.signal })).rejects.toMatchObject({ code: "ERR_CANCELED" });
  });

  test("peer path and query retries use the guarded transport/policy", () => {
    const peers = readFileSync("src/hooks/use-server-list.ts", "utf8");
    expect(peers).toContain("adapter: jsonTransport");
    const queries = readFileSync("src/providers/query-client.ts", "utf8");
    expect(queries).toContain("retry: shouldRetryApiQuery");
    const native = readFileSync("src/api/json-transport.ts", "utf8");
    expect(native).toContain('native.fetch(input, { ...init, redirect: "manual" })');
    expect(native).toContain('import("expo/fetch")');
    const installed = readFileSync("node_modules/react-native-compressor/android/src/main/java/com/reactnativecompressor/Utils/Uploader.kt", "utf8");
    expect(installed).toContain(".followRedirects(false)");
    expect(installed).toContain(".followSslRedirects(false)");
  });
});
