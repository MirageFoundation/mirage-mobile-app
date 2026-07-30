// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { getMediaImagePolicy } from "../src/components/molecules/media-image-policy";

describe("media image policy", () => {
  test("keeps feed images on disk and requests container-sized decoding", () => {
    const policy = getMediaImagePolicy({
      uri: "https://images.example/photo.jpg",
      surface: "feed",
      mediaType: "image",
      displayWidth: 390,
    });

    expect(policy.uri).toBe("https://images.example/photo.jpg");
    expect(policy.cachePolicy).toBe("disk");
    expect(policy.contentFit).toBe("cover");
    expect(policy.allowDownscaling).toBe(true);
    expect(policy.enforceEarlyResizing).toBe(true);
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
    expect(feed.enforceEarlyResizing).toBe(true);
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
      cachePolicy: "disk",
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
