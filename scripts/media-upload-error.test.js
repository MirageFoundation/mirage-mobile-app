import { describe, expect, test } from "bun:test";

import { getMediaUploadErrorDetails } from "../src/utils/media-upload-error.ts";

describe("getMediaUploadErrorDetails", () => {
  test("classifies the iOS request timeout", () => {
    expect(getMediaUploadErrorDetails({
      message: "Upload Failed",
      cause: { message: "The request timed out", code: -1001 },
    }).kind).toBe("timeout");
  });

  test("classifies offline failures", () => {
    expect(getMediaUploadErrorDetails({ message: "The Internet connection appears to be offline. (-1009)" }).kind)
      .toBe("network");
  });

  test("classifies HTTP failures", () => {
    const result = getMediaUploadErrorDetails({ status: 503, responseText: "unavailable" });
    expect(result.kind).toBe("server");
    expect(result.status).toBe(503);
  });

  test("uses the backend error code contract", () => {
    const result = getMediaUploadErrorDetails({
      status: 413,
      responseText: JSON.stringify({
        error: "uploaded file is too large",
        error_code: "media_too_large",
      }),
    });
    expect(result.message).toBe("This file is too large to upload.");
  });
});
