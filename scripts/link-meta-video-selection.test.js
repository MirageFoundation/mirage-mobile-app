import { describe, expect, test } from "bun:test";

import {
  selectHighestQualityMp4Variant,
  selectRedditPreviewVideoUrl,
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
