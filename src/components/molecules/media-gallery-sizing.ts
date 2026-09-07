export const GALLERY_MEDIA_MAX_HEIGHT = 450;
export const GALLERY_MEDIA_FALLBACK_ASPECT_RATIO = 4 / 5;

export type MediaDimensions = {
  width?: number;
  height?: number;
  aspectRatio?: number;
};

export function validMediaAspectRatio(ratio?: number): number | undefined {
  return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
    ? ratio
    : undefined;
}

export function getIntrinsicMediaAspectRatio(item?: MediaDimensions): number | undefined {
  const width = validMediaAspectRatio(item?.width);
  const height = validMediaAspectRatio(item?.height);
  return (width && height ? validMediaAspectRatio(width / height) : undefined)
    ?? validMediaAspectRatio(item?.aspectRatio);
}

export function hasGalleryItemAspectRatio(item: MediaDimensions): boolean {
  return getIntrinsicMediaAspectRatio(item) !== undefined;
}

export function resolveGalleryItemAspectRatio(
  item: MediaDimensions,
  decodedRatio?: number,
): number {
  return getIntrinsicMediaAspectRatio(item)
    ?? validMediaAspectRatio(decodedRatio)
    ?? GALLERY_MEDIA_FALLBACK_ASPECT_RATIO;
}

export function computeGalleryFrameHeight(
  aspectRatio: number,
  galleryWidth: number,
  maxHeight = GALLERY_MEDIA_MAX_HEIGHT,
): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return Math.min(galleryWidth / GALLERY_MEDIA_FALLBACK_ASPECT_RATIO, maxHeight);
  }
  return Math.min(galleryWidth / aspectRatio, maxHeight);
}

export function resolveGallerySlideFrame(
  aspectRatio: number,
  galleryWidth: number,
  maxHeight = GALLERY_MEDIA_MAX_HEIGHT,
): { width: number; height: number } {
  return {
    width: galleryWidth,
    height: computeGalleryFrameHeight(aspectRatio, galleryWidth, maxHeight),
  };
}
