import { describe, expect, test } from "bun:test";

import {
  classifyUploadError,
  sanitizeRemoteUrl,
} from "../src/api/read/utils/media-upload-telemetry";

describe("media upload telemetry", () => {
  test("classifies expected upload failures without raw payload inspection", () => {
    expect(classifyUploadError(new Error("Upload aborted"))).toBe("aborted");
    expect(classifyUploadError(new Error("Video upload timed out after 720s"))).toBe("timeout");
    expect(classifyUploadError(Object.assign(new Error("failed"), { status: 429 }))).toBe("http_4xx");
    expect(classifyUploadError(Object.assign(new Error("failed"), { status: 503 }))).toBe("http_5xx");
    expect(classifyUploadError(Object.assign(new Error("failed"), { code: "ERR_NETWORK" }))).toBe("network");
  });

  test("removes query strings and rejects local paths", () => {
    expect(sanitizeRemoteUrl("https://cdn.example/video.m3u8?token=secret#part"))
      .toBe("https://cdn.example/video.m3u8");
    expect(sanitizeRemoteUrl("file:///private/user/video.mp4")).toBeUndefined();
    expect(sanitizeRemoteUrl("/private/user/video.mp4")).toBeUndefined();
  });
});
