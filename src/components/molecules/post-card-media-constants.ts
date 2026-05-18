import { Dimensions } from "react-native";

import type { ResolvedMedia } from "./post-card-utils";

export const SCREEN_WIDTH = Dimensions.get("window").width;
export const MEDIA_MAX_HEIGHT = 450;
export const MEDIA_HORIZONTAL_PADDING = 32; // md padding * 2

export const MEDIA_ASPECT_RATIO_CACHE = new Map<string, number>();
export const MEDIA_LOADED_CACHE = new Set<string>();

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
