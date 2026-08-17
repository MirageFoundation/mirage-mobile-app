// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { getPrefetchableFeedImageUris } from "../src/utils/feed-image-prefetch";

describe("feed image prefetch", () => {
  test("collects still images and skips video, gif, and youtube urls", () => {
    const uris = getPrefetchableFeedImageUris([
      {
        thumbnail: "https://imagedelivery.net/account/image/public",
        media: [
          "https://imagedelivery.net/account/image/public",
          "https://cdn.example/clip.mp4",
          "https://media.example/loop.gif",
          "https://www.youtube.com/watch?v=abc",
          "https://images.example/extra.png",
        ],
      },
      {
        thumbnail: "https://vz-99c4cbfc-c60.b-cdn.net/abc/playlist.m3u8",
        media: ["https://vz-99c4cbfc-c60.b-cdn.net/abc/playlist.m3u8"],
      },
    ]);

    expect(uris).toEqual([
      "https://imagedelivery.net/account/image/public",
      "https://images.example/extra.png",
    ]);
  });
});
