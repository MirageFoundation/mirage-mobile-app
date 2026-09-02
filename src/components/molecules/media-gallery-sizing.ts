export const GALLERY_MEDIA_MAX_HEIGHT = 450;
export const GALLERY_MEDIA_FALLBACK_ASPECT_RATIO = 4 / 5;

export function hasGalleryItemAspectRatio(item: {
  width?: number;
  height?: number;
  aspectRatio?: number;
}): boolean {
  return !!(
    (item.width && item.height && item.height > 0) ||
    (item.aspectRatio && Number.isFinite(item.aspectRatio) && item.aspectRatio > 0)
  );
}

export function resolveGalleryItemAspectRatio(item: {
  width?: number;
  height?: number;
  aspectRatio?: number;
}): number {
  if (item.width && item.height && item.height > 0) {
    return item.width / item.height;
  }
  if (item.aspectRatio && Number.isFinite(item.aspectRatio) && item.aspectRatio > 0) {
    return item.aspectRatio;
  }
  return GALLERY_MEDIA_FALLBACK_ASPECT_RATIO;
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
