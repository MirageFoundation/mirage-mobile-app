import { describe, expect, test } from "bun:test";

import {
  selectHighestQualityMp4Variant,
  selectRedditPreviewVideoUrl,
  selectRedditSourceVideoUrl,
} from "../src/utils/link-meta-video-selection";

describe("link metadata video selection", () => {
  test("selects the highest bitrate X MP4 regardless of payload order", () => {
    const selected = selectHighestQualityMp4Variant([
      { type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/low.mp4" },
      { type: "application/x-mpegURL", url: "https://video.twimg.com/master.m3u8" },
      { type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" },
      { type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/medium.mp4" },
    ]);

    expect(selected).toBe("https://video.twimg.com/high.mp4");
  });

  test("supports alternate X variant field names", () => {
    expect(selectHighestQualityMp4Variant([
      {
        content_type: "video/mp4",
        bit_rate: "1280000",
        url: "https://video.twimg.com/alternate.mp4",
      },
    ])).toBe("https://video.twimg.com/alternate.mp4");
  });

  test("rejects tiny Reddit preview animations as primary video", () => {
    expect(selectRedditPreviewVideoUrl({
      fallback_url: "https://v.redd.it/preview/DASH_96.mp4",
      width: 114,
      height: 96,
    })).toBeNull();
  });

  test("keeps usable Reddit preview video as a last-resort fallback", () => {
    expect(selectRedditPreviewVideoUrl({
      fallback_url: "https://v.redd.it/preview/DASH_480.mp4?x=1&amp;y=2",
      width: 854,
      height: 480,
    })).toBe("https://v.redd.it/preview/DASH_480.mp4?x=1&y=2");
  });

  test("keeps previews with missing dimensions for legacy payloads", () => {
    expect(selectRedditPreviewVideoUrl({
      fallback_url: "https://v.redd.it/preview/DASH_480.mp4",
    })).toBe("https://v.redd.it/preview/DASH_480.mp4");
  });
});

describe("Reddit source video selection", () => {
  test("upgrades a compressed DASH fallback to the reported source height", () => {
    expect(selectRedditSourceVideoUrl({
      fallback_url: "https://v.redd.it/abc/DASH_96.mp4?source=fallback",
      width: 1920,
      height: 1080,
    })).toBe("https://v.redd.it/abc/DASH_1080.mp4?source=fallback");
  });

  test("uses the shorter side so portrait 1080p maps to DASH_1080", () => {
    expect(selectRedditSourceVideoUrl({
      fallback_url: "https://v.redd.it/abc/DASH_240.mp4?source=fallback",
      width: 1080,
      height: 1920,
    })).toBe("https://v.redd.it/abc/DASH_1080.mp4?source=fallback");
  });

  test("does not downgrade a fallback that already matches or exceeds the source", () => {
    expect(selectRedditSourceVideoUrl({
      fallback_url: "https://v.redd.it/abc/DASH_720.mp4?source=fallback",
      width: 1280,
      height: 720,
    })).toBe("https://v.redd.it/abc/DASH_720.mp4?source=fallback");
  });

  test("keeps the original fallback when dimensions are missing", () => {
    expect(selectRedditSourceVideoUrl({
      fallback_url: "https://v.redd.it/abc/DASH_96.mp4?source=fallback",
    })).toBe("https://v.redd.it/abc/DASH_96.mp4?source=fallback");
  });

  test("falls back to dash then hls when fallback_url is absent", () => {
    expect(selectRedditSourceVideoUrl({
      dash_url: "https://v.redd.it/abc/DASHPlaylist.mpd?a=1&amp;b=2",
      hls_url: "https://v.redd.it/abc/HLSPlaylist.m3u8",
    })).toBe("https://v.redd.it/abc/DASHPlaylist.mpd?a=1&b=2");
  });
});
