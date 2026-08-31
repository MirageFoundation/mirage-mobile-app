// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  postHasPlayableVideo,
  getRedgifsId,
  resolveGiphyVideoUrl,
  resolvePostContent,
  resolveRedgifsPosterUrl,
  resolveRedgifsVideoUrl,
} from "../src/components/molecules/post-card-utils";

const GIPHY_GIF =
  "https://media0.giphy.com/media/XMMUWcz4XtDTNgZj22/200.gif?cid=test&rid=200.gif&ct=g";

describe("post card GIF media", () => {
  test("uses Giphy's MP4 rendition for reliable feed playback", () => {
    expect(resolveGiphyVideoUrl(GIPHY_GIF)).toBe(
      "https://media0.giphy.com/media/XMMUWcz4XtDTNgZj22/200.mp4?cid=test&rid=200.mp4&ct=v",
    );

    const resolved = resolvePostContent(GIPHY_GIF, [
      { uri: GIPHY_GIF, type: "gif", posterUri: GIPHY_GIF },
    ]);

    expect(resolved.resolvedMedia).toMatchObject({
      uri: "https://media0.giphy.com/media/XMMUWcz4XtDTNgZj22/200.mp4?cid=test&rid=200.mp4&ct=v",
      type: "video",
      posterUri: GIPHY_GIF,
    });
    expect(postHasPlayableVideo({
      media: [{ uri: GIPHY_GIF, type: "gif" }],
    })).toBe(true);
  });

  test("keeps uploaded GIF files on the animated image surface", () => {
    const uploadedGif =
      "https://mirage-img.b-cdn.net/images/2026/08/example.gif";
    const resolved = resolvePostContent(undefined, [
      { uri: uploadedGif, type: "gif", posterUri: uploadedGif },
    ]);

    expect(resolveGiphyVideoUrl(uploadedGif)).toBeNull();
    expect(resolved.resolvedMedia).toMatchObject({
      uri: uploadedGif,
      type: "gif",
    });
  });

  test("keeps Redgifs watch pages for API-backed media resolution", () => {
    const watchUrl = "https://www.redgifs.com/watch/exampleId";

    expect(getRedgifsId(watchUrl)).toBe("exampleId");
    expect(resolveRedgifsVideoUrl(watchUrl)).toBeNull();
    expect(resolveRedgifsPosterUrl(watchUrl)).toBeNull();

    const resolved = resolvePostContent(watchUrl, undefined);
    expect(resolved.resolvedMedia).toMatchObject({
      uri: watchUrl,
      type: "gif",
    });
    expect(resolved.bodyWithoutUrl).toBeUndefined();
    expect(postHasPlayableVideo({ body: watchUrl })).toBe(true);
  });
});
