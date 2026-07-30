// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { normalizeShareIntent } from "../src/navigation/share-intent-payload";

describe("share intent payload normalization", () => {
  test("accepts a valid JSON string payload", () => {
    expect(
      normalizeShareIntent('{"type":"text","text":"shared text"}'),
    ).toEqual({
      type: "text",
      text: "shared text",
      webUrl: undefined,
      files: undefined,
    });
  });

  test("accepts a valid object payload", () => {
    expect(
      normalizeShareIntent({
        type: "media",
        files: [{ path: "file:///shared.jpg", mimeType: "image/jpeg" }],
      }),
    ).toEqual({
      type: "media",
      text: undefined,
      webUrl: undefined,
      files: [
        {
          path: "file:///shared.jpg",
          mimeType: "image/jpeg",
          fileName: undefined,
          size: undefined,
        },
      ],
    });
  });

  test("rejects a malformed object payload", () => {
    expect(normalizeShareIntent({ text: 42, files: "not-an-array" })).toBeNull();
  });

  test("rejects null", () => {
    expect(normalizeShareIntent(null)).toBeNull();
  });

  test("rejects unexpected primitives", () => {
    for (const value of [undefined, true, 42, Symbol("share")]) {
      expect(normalizeShareIntent(value)).toBeNull();
    }
  });
});
