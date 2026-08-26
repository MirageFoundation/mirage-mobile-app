// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { extractRedditEmbedMeta, getRedditEmbedUrl } from "../src/utils/reddit-embed-meta";

describe("Reddit embed metadata", () => {
  test("extracts the highest-resolution muxed video from the embed player", () => {
    const packagedMedia = JSON.stringify({
      playbackMp4s: {
        permutations: [
          {
            source: {
              url: "https://packaged-media.redd.it/abc/pb/m2-res_480p.mp4?x=1&y=2",
              dimensions: { width: 270, height: 480 },
            },
          },
          {
            source: {
              url: "https://packaged-media.redd.it/abc/pb/m2-res_1280p.mp4?x=1&y=2",
              dimensions: { width: 720, height: 1280 },
            },
          },
        ],
      },
    })
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;");

    const html = `
      <shreddit-screenview-data data="{&quot;post&quot;:{&quot;url&quot;:&quot;https://v.redd.it/abc&quot;}}"></shreddit-screenview-data>
      <a id="embed-title"><h1>A video &amp; its title</h1></a>
      <shreddit-player
        src="https://v.redd.it/abc/HLSPlaylist.m3u8?x=1&amp;y=2"
        packaged-media-json="${packagedMedia}"
        poster="https://preview.redd.it/poster.png?x=1&amp;y=2"
      ></shreddit-player>
    `;

    expect(extractRedditEmbedMeta(html)).toEqual({
      title: "A video & its title",
      description: null,
      image: "https://preview.redd.it/poster.png?x=1&y=2",
      video: "https://packaged-media.redd.it/abc/pb/m2-res_1280p.mp4?x=1&y=2",
      externalUrl: null,
    });
  });

  test("falls back to the signed HLS source when packaged MP4s are absent", () => {
    const html = `
      <a id="embed-title"><shreddit-embed-title>Fallback video</shreddit-embed-title></a>
      <shreddit-player src="https://v.redd.it/abc/HLSPlaylist.m3u8?x=1&amp;y=2"></shreddit-player>
    `;

    expect(extractRedditEmbedMeta(html).video).toBe("https://v.redd.it/abc/HLSPlaylist.m3u8?x=1&y=2");
  });

  test("builds an embed URL from a Reddit permalink", () => {
    expect(getRedditEmbedUrl("https://www.reddit.com/r/test/comments/abc/a_post/?utm_source=share")).toBe(
      "https://embed.reddit.com/r/test/comments/abc/a_post/?ref_source=embed&ref=share&embed=true",
    );
  });
});
