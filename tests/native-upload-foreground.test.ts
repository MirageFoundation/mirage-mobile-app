// @ts-nocheck -- Bun runtime test/transpiler APIs; native enforcement still needs devices.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ServerRequestCoordinator, StaleServerResponseError } from "../src/api/server-runtime";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path: string, env: Record<string, unknown>, result: string) {
  const source = read(path).replace(/^import[\s\S]*?;\n/gm, "").replace(/\bexport\s+/g, "");
  const js = new Bun.Transpiler({ loader: "tsx" }).transformSync(source);
  return new Function(...Object.keys(env), `${js}\nreturn ${result};`)(...Object.values(env));
}
function mediaHarness(native: (...args: any[]) => Promise<any>) {
  const coordinator = new ServerRequestCoordinator("https://original.example");
  const timers = new Map();
  let id = 0;
  const uploadMedia = load("src/api/read/endpoints/media.ts", {
    apiClient: {
      runExternalWrite: (fn) => coordinator.runWrite(fn),
      assertCurrentServerContext: (context) => coordinator.assertCurrent(context),
    },
    getMirageRequestHeaders: () => ({ "X-Mirage-Visitor": "throwaway", "X-Mirage-Platform": "ios" }),
    StaleServerResponseError,
    Sentry: { addBreadcrumb() {} },
    AppState: { currentState: "active" },
    backgroundUpload: native,
    UploadType: { MULTIPART: 1 }, UploaderHttpMethod: { POST: "POST" },
    classifyUploadError: () => "network",
    console: { log() {} },
    setTimeout: (fn, delay) => { const key = ++id; if (delay < 10000) queueMicrotask(fn); else timers.set(key, fn); return key; },
    clearTimeout: (key) => timers.delete(key),
  }, "uploadMedia");
  return { uploadMedia, coordinator, timers };
}
const success = { status: 200, body: '{"url":"https://media.example/synthetic"}' };

describe("foreground upload application seam (mocked native)", () => {
  test("initial destination, headers, file field, MIME, kind and video metadata survive", async () => {
    let captured;
    const { uploadMedia, timers } = mediaHarness(async (...args) => { captured = args; args[3](5, 10); return success; });
    const progress = [];
    await uploadMedia("/tmp/synthetic.mp4", "video", "video/mp4", (value) => progress.push(value), undefined, { duration: "12", width: "640", height: "360" });
    expect(captured[0]).toBe("https://original.example/api/upload_media?kind=video");
    expect(captured[1]).toBe("file:///tmp/synthetic.mp4");
    expect(captured[2]).toEqual({ uploadType: 1, fieldName: "file", mimeType: "video/mp4", httpMethod: "POST", parameters: { kind: "video", duration: "12", width: "640", height: "360" }, headers: { "X-Mirage-Visitor": "throwaway", "X-Mirage-Platform": "ios" } });
    expect(progress).toEqual([50]);
    expect(timers.size).toBe(0);
  });
  test("every 3xx is terminal for image and video, without retry", async () => {
    for (const kind of ["image", "video"]) for (let status = 300; status < 400; status++) {
      let calls = 0;
      const { uploadMedia } = mediaHarness(async () => { calls++; return { status, body: "redirect" }; });
      await expect(uploadMedia("/tmp/synthetic", kind, `${kind}/test`)).rejects.toMatchObject({ status });
      expect(calls).toBe(1);
    }
  });
  test("image retries twice on the original server; video never retries", async () => {
    for (const [kind, expected] of [["image", 3], ["video", 1]]) {
      const destinations = [];
      const { uploadMedia } = mediaHarness(async (url) => { destinations.push(url); throw new Error("network failed"); });
      await expect(uploadMedia("/tmp/synthetic", kind, `${kind}/test`)).rejects.toThrow("network failed");
      expect(destinations).toEqual(Array(expected).fill(`https://original.example/api/upload_media?kind=${kind}`));
    }
  });
  test("pre-abort does not start native work", async () => {
    let calls = 0;
    const { uploadMedia } = mediaHarness(async () => { calls++; return success; });
    const controller = new AbortController(); controller.abort();
    await expect(uploadMedia("/tmp/synthetic", "image", "image/jpeg", undefined, controller.signal)).rejects.toThrow("Upload aborted");
    expect(calls).toBe(0);
  });
  test("timeout cancels native and clears the timer (video has no retry)", async () => {
    let signal;
    const { uploadMedia, timers } = mediaHarness(async (...args) => { signal = args[4]; return new Promise(() => {}); });
    const upload = uploadMedia("/tmp/synthetic", "video", "video/mp4");
    await Promise.resolve();
    for (const fire of timers.values()) fire();
    await expect(upload).rejects.toMatchObject({ code: "upload_timeout" });
    expect(signal.aborted).toBe(true);
    expect(timers.size).toBe(0);
  });
  test("forced stale success is rejected and not retargeted", async () => {
    let finish;
    const destinations = [];
    const { uploadMedia, coordinator } = mediaHarness((url) => { destinations.push(url); return new Promise((resolve) => { finish = resolve; }); });
    const upload = uploadMedia("/tmp/synthetic", "image", "image/jpeg");
    await Promise.resolve();
    coordinator.replaceImmediately("https://replacement.example");
    finish(success);
    await expect(upload).rejects.toBeInstanceOf(StaleServerResponseError);
    expect(destinations).toHaveLength(1);
  });
});

function bridgeHarness() {
  let count = 0;
  const tasks = new Map(); const listeners = new Set(); const cancelled = [];
  const upload = load("node_modules/react-native-compressor/src/utils/Uploader.tsx", {
    NativeEventEmitter: class { addListener(_name, fn) { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } },
    Platform: { OS: "ios" }, uuidv4: () => `upload-${++count}`,
    Compressor: {
      upload: (_file, options) => new Promise((resolve, reject) => tasks.set(options.uuid, { resolve, reject, options })),
      cancelUpload: (uuid) => { cancelled.push(uuid); tasks.get(uuid)?.reject(new Error("cancelled")); tasks.delete(uuid); },
    },
  }, "backgroundUpload");
  return { upload, tasks, listeners, cancelled };
}
describe("patched RN cancellation bridge (mocked native, actual patched TS)", () => {
  test("pre-abort skips registration and native upload", async () => {
    const h = bridgeHarness(); const controller = new AbortController(); controller.abort();
    await expect(h.upload("https://initial.example", "file:///synthetic", {}, () => {}, controller.signal)).rejects.toThrow("Upload aborted");
    expect(h.tasks.size).toBe(0); expect(h.listeners.size).toBe(0);
  });
  test("abort during listener registration cannot start work", async () => {
    const h = bridgeHarness(); let listener;
    const signal = { aborted: false, addEventListener(_name, fn) { listener = fn; this.aborted = true; fn(); }, removeEventListener(_name, fn) { expect(fn).toBe(listener); } };
    await expect(h.upload("https://initial.example", "file:///synthetic", {}, () => {}, signal)).rejects.toThrow("Upload aborted");
    expect(h.tasks.size).toBe(0); expect(h.listeners.size).toBe(0);
  });
  test("cancellation ID callback can abort after native registration", async () => {
    const h = bridgeHarness(); const controller = new AbortController();
    await expect(h.upload("https://initial.example", "file:///synthetic", { getCancellationId: () => controller.abort() }, () => {}, controller.signal)).rejects.toThrow("Upload aborted");
    expect(h.cancelled).toContain("upload-1"); expect(h.tasks.size).toBe(0); expect(h.listeners.size).toBe(0);
  });
  test("concurrent IDs isolate progress and settlement; exact abort listener is removed", async () => {
    const h = bridgeHarness(); const progress = [[], []]; const signals = [new AbortController(), new AbortController()];
    const jobs = signals.map((controller, i) => h.upload("https://initial.example", "file:///synthetic", {}, (...args) => progress[i].push(args), controller.signal));
    for (const emit of h.listeners) emit({ uuid: "upload-2", data: { written: 5, total: 10 } });
    expect(progress).toEqual([[], [[5, 10]]]);
    h.tasks.get("upload-1").resolve(success); await jobs[0];
    signals[0].abort(); expect(h.cancelled).toEqual([]);
    signals[1].abort(); await expect(jobs[1]).rejects.toThrow("Upload aborted");
    expect(h.listeners.size).toBe(0);
  });
});

describe("native patch source gates (not device proof)", () => {
  test("iOS controllable session, redirect veto, independent state and bounded file body", () => {
    const native = read("node_modules/react-native-compressor/ios/Utils/Uploader.swift");
    expect(native).toContain("URLSessionConfiguration.default");
    expect(native).not.toContain("URLSessionConfiguration.background");
    expect(native).not.toContain("configuration.identifier");
    expect(native).toContain("willPerformHTTPRedirection"); expect(native).toContain("completionHandler(nil)");
    expect(native).toContain("task.taskDescription = uuid");
    expect(native).toContain("uploads.removeValue(forKey: uuid)");
    expect(native).toContain("session.finishTasksAndInvalidate()");
    expect(native).toContain("operations.underlyingQueue = queue");
    expect(native).toContain("fromFile: bodyFile"); expect(native).toContain("read(upToCount: 64 * 1024)");
    expect(native).not.toContain("Data(contentsOf:"); expect(native).not.toContain("withStreamedRequest");
    expect(native).toContain("removeItem(at: file)"); expect(native).toContain("removeItem(at: destination)");
    expect(native).toContain("redirectResponse"); expect(native).toContain("responseLimit");
    expect(native).toContain('boundary=\\(boundary)');
    expect(native).not.toContain("print(");
  });
  test("tracked patch retains Android no-follow/timeouts and includes Swift and Metro source", () => {
    const patch = read("patches/react-native-compressor@1.18.2.patch");
    for (const marker of [".followRedirects(false)", ".followSslRedirects(false)", ".readTimeout(600", ".writeTimeout(600", "URLSessionConfiguration.default", "completionHandler(nil)", "src/utils/Uploader.tsx"]) expect(patch).toContain(marker);
    expect(read("src/pages/create/create-upload-warning.tsx")).toContain("Keep Mirage open until the upload finishes.");
  });
});
