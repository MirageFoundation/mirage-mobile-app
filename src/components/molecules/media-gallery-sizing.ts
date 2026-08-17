export const GALLERY_MEDIA_MAX_HEIGHT = 450;

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
  return 16 / 9;
}

export function computeGalleryFrameHeight(
  aspectRatio: number,
  galleryWidth: number,
  maxHeight = GALLERY_MEDIA_MAX_HEIGHT,
): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return Math.min(galleryWidth / (16 / 9), maxHeight);
  }
  return Math.min(galleryWidth / aspectRatio, maxHeight);
}
