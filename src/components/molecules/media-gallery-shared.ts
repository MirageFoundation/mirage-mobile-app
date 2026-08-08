import { Dimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ResolvedMedia } from "./post-card-utils";
import { BoundedLruMap, BoundedLruSet } from "@/src/utils/bounded-lru";

/**
 * Shared sizing, caches, and styles for the gallery container and its item
 * components (`gallery-video-item.tsx`, `gallery-image-item.tsx`).
 */

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_HORIZONTAL_PADDING = 32;
export const GALLERY_WIDTH = SCREEN_WIDTH - MEDIA_HORIZONTAL_PADDING;
export const GALLERY_MEDIA_MAX_HEIGHT = 450;

export const GALLERY_ASPECT_RATIO_CACHE = new BoundedLruMap<string, number>(256);
export const GALLERY_LOADED_CACHE = new BoundedLruSet<string>(512);

export function getGalleryItemAspectRatio(item: ResolvedMedia): number {
  const cached = GALLERY_ASPECT_RATIO_CACHE.get(item.uri);
  if (cached) return cached;
  if (item.aspectRatio && item.aspectRatio !== 16 / 9) return item.aspectRatio;
  if (item.width && item.height) return item.width / item.height;
  return 16 / 9;
}

export function computeGalleryHeight(aspectRatio: number): number {
  return Math.min(GALLERY_WIDTH / aspectRatio, GALLERY_MEDIA_MAX_HEIGHT);
}

export const galleryStyles = StyleSheet.create((theme) => ({
  galleryRoot: {
    overflow: "hidden",
    borderRadius: theme.radius.md,
  },
  itemWrapper: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  itemContainer: {
    overflow: "hidden",
    borderRadius: theme.radius.md,
  },
  itemMedia: {
    borderRadius: theme.radius.md,
  },
  indicators: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: "#fff",
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  videoTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  controlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  tapToPlayContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  muteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenButton: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 20,
  },
  fullscreenButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  blurViewFill: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  revealTextContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
}));
