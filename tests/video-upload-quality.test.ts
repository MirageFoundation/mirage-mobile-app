// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  BITRATE_480P,
  BITRATE_720P,
  BITRATE_1080P,
  BITRATE_1080P_LONGFORM,
  LONGFORM_MAX_HEIGHT,
  SHORT_CLIP_MAX_LONG_SIDE,
  UNKNOWN_SOURCE_BITRATE,
  UNKNOWN_SOURCE_MAX_SIZE,
  getUploadVideoCompressionSettings,
} from "../src/utils/video-upload-quality";

const SHORT_MS = 15_000;
const LONG_MS = 61_000;

describe("getUploadVideoCompressionSettings", () => {
  test("keeps 480p sources at 480p bitrate without upscaling", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 854,
      sourceHeight: 480,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: 854, bitrate: BITRATE_480P });

    expect(getUploadVideoCompressionSettings({
      sourceWidth: 640,
      sourceHeight: 360,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: 640, bitrate: BITRATE_480P });
  });

  test("keeps 720p sources at 720p bitrate", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 1280,
      sourceHeight: 720,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: 1280, bitrate: BITRATE_720P });
  });

  test("preserves short 1080p landscape instead of crushing to 720p", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 1920,
      sourceHeight: 1080,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: SHORT_CLIP_MAX_LONG_SIDE, bitrate: BITRATE_1080P });
  });

  test("preserves short 1080p portrait on the longer side", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 1080,
      sourceHeight: 1920,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: SHORT_CLIP_MAX_LONG_SIDE, bitrate: BITRATE_1080P });
  });

  test("caps long-form height at 1080 so portrait 1080x1920 is accepted", () => {
    const settings = getUploadVideoCompressionSettings({
      sourceWidth: 1080,
      sourceHeight: 1920,
      totalDurationMs: LONG_MS,
    });
    expect(settings.maxSize).toBe(LONGFORM_MAX_HEIGHT);
    expect(settings.bitrate).toBe(BITRATE_720P);
  });

  test("keeps long-form 1080p landscape at 1080p with the longform bitrate", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 1920,
      sourceHeight: 1080,
      totalDurationMs: LONG_MS,
    })).toEqual({
      maxSize: SHORT_CLIP_MAX_LONG_SIDE,
      bitrate: BITRATE_1080P_LONGFORM,
    });
  });

  test("caps oversized 4K sources to 1080p rather than uploading 2160p", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 3840,
      sourceHeight: 2160,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: SHORT_CLIP_MAX_LONG_SIDE, bitrate: BITRATE_1080P });

    expect(getUploadVideoCompressionSettings({
      sourceWidth: 3840,
      sourceHeight: 2160,
      totalDurationMs: LONG_MS,
    })).toEqual({
      maxSize: SHORT_CLIP_MAX_LONG_SIDE,
      bitrate: BITRATE_1080P_LONGFORM,
    });
  });

  test("caps 1440p short clips on the 1080p long side", () => {
    expect(getUploadVideoCompressionSettings({
      sourceWidth: 2560,
      sourceHeight: 1440,
      totalDurationMs: SHORT_MS,
    })).toEqual({ maxSize: SHORT_CLIP_MAX_LONG_SIDE, bitrate: BITRATE_1080P });
  });

  test("falls back to the previous 1280/1.8Mbps policy when dimensions are missing", () => {
    expect(getUploadVideoCompressionSettings({
      totalDurationMs: SHORT_MS,
    })).toEqual({
      maxSize: UNKNOWN_SOURCE_MAX_SIZE,
      bitrate: UNKNOWN_SOURCE_BITRATE,
    });

    expect(getUploadVideoCompressionSettings({
      sourceWidth: 0,
      sourceHeight: 1080,
      totalDurationMs: SHORT_MS,
    })).toEqual({
      maxSize: UNKNOWN_SOURCE_MAX_SIZE,
      bitrate: UNKNOWN_SOURCE_BITRATE,
    });

    expect(getUploadVideoCompressionSettings({
      totalDurationMs: LONG_MS,
    })).toEqual({
      maxSize: LONGFORM_MAX_HEIGHT,
      bitrate: UNKNOWN_SOURCE_BITRATE,
    });
  });
});
