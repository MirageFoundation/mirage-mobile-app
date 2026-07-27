// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import {
  getCachedVideoSource,
  replaceVideoPlayerSourceAsync,
} from "../src/utils/video-source-replacement";

describe("video source replacement", () => {
  test("caches progressive remote videos but not streams or local sources", () => {
    expect(getCachedVideoSource("https://cdn.example/video.mp4")).toEqual({
      uri: "https://cdn.example/video.mp4",
      useCaching: true,
    });
    expect(getCachedVideoSource("https://cdn.example/video.m3u8?token=1")).toBe(
      "https://cdn.example/video.m3u8?token=1",
    );
    expect(getCachedVideoSource("file:///video.mp4")).toBe("file:///video.mp4");
    expect(getCachedVideoSource(null)).toBeNull();
  });

  test("serializes native replacements and skips superseded queued sources", async () => {
    const calls: string[] = [];
    const resolvers: (() => void)[] = [];
    let active = 0;
    let maxActive = 0;
    const player = {
      replaceAsync: async (source: string) => {
        calls.push(source);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => resolvers.push(resolve));
        active -= 1;
      },
    };

    const first = replaceVideoPlayerSourceAsync(player, "first.m3u8");
    await Promise.resolve();
    const second = replaceVideoPlayerSourceAsync(player, "second.m3u8");
    const third = replaceVideoPlayerSourceAsync(player, "third.m3u8");

    resolvers.shift()?.();
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    await Promise.resolve();
    expect(calls).toEqual(["first.m3u8", "third.m3u8"]);
    resolvers.shift()?.();
    expect(await third).toBe(true);
    expect(maxActive).toBe(1);
  });
});
