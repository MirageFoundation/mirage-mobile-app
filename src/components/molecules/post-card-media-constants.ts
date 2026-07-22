import { Dimensions } from "react-native";
import * as Sentry from "@sentry/react-native";
import { BoundedLruMap, BoundedLruSet } from "@/src/utils/bounded-lru";

import type { ResolvedMedia } from "./post-card-utils";

export const SCREEN_WIDTH = Dimensions.get("window").width;
export const MEDIA_MAX_HEIGHT = 450;
export const MEDIA_HORIZONTAL_PADDING = 32; // md padding * 2

let mediaCacheEvictions = 0;
const reportMediaCacheEviction = (cache: string, entryCount: number, capacity: number) => {
  mediaCacheEvictions += 1;
  if (__DEV__ && mediaCacheEvictions % 64 === 1) {
    Sentry.addBreadcrumb({
      category: "cache.media",
      message: "Media cache evicted least-recently-used entry",
      level: "info",
      data: { cache, entryCount, capacity, evictionCount: mediaCacheEvictions },
    });
  }
};

export const MEDIA_ASPECT_RATIO_CACHE = new BoundedLruMap<string, number>(
  256,
  (_key, _value, entryCount) => reportMediaCacheEviction("aspect_ratio", entryCount, 256),
);
export const MEDIA_LOADED_CACHE = new BoundedLruSet<string>(
  512,
  (_value, entryCount) => reportMediaCacheEviction("loaded", entryCount, 512),
);

export function getMediaAspectRatio(media?: ResolvedMedia): number {
  if (!media) return 16 / 9;
  const cached = media.uri
    ? MEDIA_ASPECT_RATIO_CACHE.get(media.uri)
    : undefined;
  if (cached) return cached;
  if (media.aspectRatio) return media.aspectRatio;
  if (media.width && media.height) {
    return media.width / media.height;
  }
  if (media.type === "video") return 4 / 3;
  return 16 / 9;
}
