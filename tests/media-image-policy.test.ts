// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  getMediaImagePolicy,
  getMediaImageSource,
} from "../src/components/molecules/media-image-policy";

describe("media image policy", () => {
  test("keeps feed images in memory-disk and skips iOS-only early resize", () => {
    const policy = getMediaImagePolicy({
      uri: "https://images.example/photo.jpg",
      surface: "feed",
      mediaType: "image",
      displayWidth: 390,
      intrinsicWidth: 1600,
      intrinsicHeight: 900,
      visible: true,
    });

    expect(policy.uri).toBe("https://images.example/photo.jpg");
    expect(policy.cachePolicy).toBe("memory-disk");
    expect(policy.contentFit).toBe("cover");
    expect(policy.allowDownscaling).toBe(true);
    expect(policy.enforceEarlyResizing).toBe(false);
    expect(policy.priority).toBe("high");
    expect(getMediaImageSource(policy)).toEqual({
      uri: "https://images.example/photo.jpg",
      width: 1600,
      height: 900,
    });
  });

  test("lowers priority for off-screen feed images and omits unknown sizes", () => {
    const policy = getMediaImagePolicy({
      uri: "https://images.example/photo.jpg",
      surface: "feed",
      mediaType: "image",
      visible: false,
    });

    expect(policy.priority).toBe("normal");
    expect(getMediaImageSource(policy)).toEqual({
      uri: "https://images.example/photo.jpg",
    });
  });

  test("keeps detail originals and memory-disk revisit behavior", () => {
    const uri = "https://imagedelivery.net/account/image-id/public";
    const policy = getMediaImagePolicy({
      uri,
      surface: "detail",
      mediaType: "image",
      contentFit: "contain",
      displayWidth: 390,
    });

    expect(policy.uri).toBe(uri);
    expect(policy.cachePolicy).toBe("memory-disk");
    expect(policy.contentFit).toBe("contain");
    expect(policy.enforceEarlyResizing).toBe(false);
    expect(policy.priority).toBe("high");
  });

  test("never rewrites poster URLs (no server-side resizing on the CDN)", () => {
    const uri = "https://vz-99c4cbfc-c60.b-cdn.net/abc-123/thumbnail.jpg";
    const feed = getMediaImagePolicy({
      uri,
      surface: "feed",
      mediaType: "poster",
      displayWidth: 1000,
    });
    const detail = getMediaImagePolicy({
      uri,
      surface: "detail",
      mediaType: "poster",
      displayWidth: 1000,
    });

    expect(feed.uri).toBe(uri);
    expect(feed.recyclingKey).toBe(uri);
    expect(feed.cachePolicy).toBe("memory-disk");
    expect(feed.enforceEarlyResizing).toBe(false);
    expect(detail.uri).toBe(uri);
  });

  test("does not rewrite animated, local, or unknown URLs", () => {
    const gif = "https://media.example/animation.gif?version=2";
    const local = "file:///tmp/photo.jpg";
    const unknown = "https://unknown.example/media?id=42";

    expect(getMediaImagePolicy({
      uri: gif,
      surface: "feed",
      mediaType: "gif",
    })).toMatchObject({
      uri: gif,
      cachePolicy: "memory-disk",
      enforceEarlyResizing: false,
    });
    expect(getMediaImagePolicy({
      uri: local,
      surface: "feed",
      mediaType: "image",
    })).toMatchObject({
      uri: local,
      cachePolicy: "none",
      enforceEarlyResizing: false,
    });
    expect(getMediaImagePolicy({
      uri: unknown,
      surface: "feed",
      mediaType: "unknown",
    }).uri).toBe(unknown);
  });
});
