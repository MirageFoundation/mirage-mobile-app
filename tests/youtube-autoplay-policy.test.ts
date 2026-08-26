// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  parseYouTubePlayerMessage,
  shouldAllowYouTubeNavigation,
  YOUTUBE_BRIDGE_CHANNEL,
} from "../src/components/molecules/youtube-autoplay-policy";

const VIDEO_ID = "dQw4w9WgXcQ";
const NONCE = "0123456789abcdef";

function navigation(
  url: string,
  overrides: Partial<{ isTopFrame: boolean; navigationType: string }> = {},
) {
  return {
    url,
    isTopFrame: false,
    navigationType: "other",
    ...overrides,
  };
}

function message(value: Record<string, unknown>) {
  return JSON.stringify({ channel: YOUTUBE_BRIDGE_CHANNEL, nonce: NONCE, ...value });
}

describe("YouTube WebView navigation policy", () => {
  test("allows only the exact HTTPS player host and current embed endpoint in a subframe", () => {
    expect(
      shouldAllowYouTubeNavigation(
        navigation(`https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1`),
        false,
        VIDEO_ID,
      ),
    ).toBe(true);

    for (const url of [
      `http://www.youtube.com/embed/${VIDEO_ID}`,
      `https://youtube.com/embed/${VIDEO_ID}`,
      `https://m.youtube.com/embed/${VIDEO_ID}`,
      `https://www.youtube.com.evil.example/embed/${VIDEO_ID}`,
      `https://evil.example/?next=https://www.youtube.com/embed/${VIDEO_ID}`,
      `data:text/html,<script>alert(1)</script>`,
      `file:///embed/${VIDEO_ID}`,
      `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      `https://www.youtube.com/embed/aaaaaaaaaaa`,
    ]) {
      expect(shouldAllowYouTubeNavigation(navigation(url), false, VIDEO_ID)).toBe(false);
    }
  });

  test("permits inline bootstrap once and denies redirects or external top-frame navigation", () => {
    for (const url of ["about:blank", "https://localhost/"]) {
      expect(
        shouldAllowYouTubeNavigation(
          navigation(url, { isTopFrame: true }),
          true,
          VIDEO_ID,
        ),
      ).toBe(true);
      expect(
        shouldAllowYouTubeNavigation(
          navigation(url, { isTopFrame: true }),
          false,
          VIDEO_ID,
        ),
      ).toBe(false);
    }

    expect(
      shouldAllowYouTubeNavigation(
        navigation(`https://www.youtube.com/embed/${VIDEO_ID}`, { isTopFrame: true }),
        true,
        VIDEO_ID,
      ),
    ).toBe(false);
    expect(
      shouldAllowYouTubeNavigation(
        navigation("https://localhost/redirect", { isTopFrame: true }),
        true,
        VIDEO_ID,
      ),
    ).toBe(false);
    expect(
      shouldAllowYouTubeNavigation(
        navigation("about:blank", { isTopFrame: true, navigationType: "click" }),
        true,
        VIDEO_ID,
      ),
    ).toBe(false);
  });
});

describe("YouTube WebView message policy", () => {
  test("accepts valid player state and bounded time events", () => {
    expect(parseYouTubePlayerMessage(message({ type: "ready" }), NONCE)).toEqual({
      channel: YOUTUBE_BRIDGE_CHANNEL,
      nonce: NONCE,
      type: "ready",
    });
    expect(
      parseYouTubePlayerMessage(message({ type: "timeUpdate", seconds: 12.5 }), NONCE),
    ).toMatchObject({ type: "timeUpdate", seconds: 12.5 });
    expect(
      parseYouTubePlayerMessage(
        message({ type: "currentTime", seconds: 42, requestId: "123-1" }),
        NONCE,
      ),
    ).toMatchObject({ type: "currentTime", seconds: 42, requestId: "123-1" });
  });

  test("rejects malformed, oversized, wrong-channel, and nonce-mismatched messages", () => {
    for (const raw of [
      "not-json",
      "null",
      "[]",
      "x".repeat(1_025),
      JSON.stringify({ channel: "other", nonce: NONCE, type: "ready" }),
      message({ type: "ready", nonce: "wrong" }),
    ]) {
      expect(parseYouTubePlayerMessage(raw, NONCE)).toBeNull();
    }
  });

  test("rejects unexpected events, shapes, prototype keys, and unbounded primitives", () => {
    for (const raw of [
      message({ type: "error" }),
      message({ type: "ready", extra: true }),
      message({ type: "timeUpdate", seconds: -1 }),
      message({ type: "timeUpdate", seconds: 604_801 }),
      message({ type: "timeUpdate", seconds: "12" }),
      message({ type: "currentTime", seconds: 1, requestId: "bad request" }),
      `{"channel":"${YOUTUBE_BRIDGE_CHANNEL}","nonce":"${NONCE}","type":"ready","__proto__":{"admin":true}}`,
    ]) {
      expect(parseYouTubePlayerMessage(raw, NONCE)).toBeNull();
    }
  });
});
