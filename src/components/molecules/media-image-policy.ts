export type MediaImageSurface = "feed" | "detail";
export type MediaImageType = "image" | "gif" | "poster" | "unknown";

export type MediaImagePolicy = {
  uri: string;
  cachePolicy: "none" | "disk" | "memory-disk";
  contentFit: "cover" | "contain";
  allowDownscaling: boolean;
  enforceEarlyResizing: boolean;
  recyclingKey: string;
};

type MediaImagePolicyInput = {
  uri: string;
  surface: MediaImageSurface;
  mediaType?: MediaImageType;
  contentFit?: "cover" | "contain";
  /**
   * Kept for call-site stability; server-side thumbnail resizing is not
   * available on the current CDN, so downscaling happens client-side via
   * `enforceEarlyResizing`/`allowDownscaling`.
   */
  displayWidth?: number;
};

function isLocalImageUri(uri: string): boolean {
  return /^(asset|blob|content|data|file):/i.test(uri);
}

function isAnimatedImage(uri: string, mediaType: MediaImageType): boolean {
  if (mediaType === "gif") return true;
  try {
    return /\.(gif|gifv)$/i.test(new URL(uri).pathname);
  } catch {
    return false;
  }
}

export function getMediaImagePolicy({
  uri,
  surface,
  mediaType = "unknown",
  contentFit = "cover",
}: MediaImagePolicyInput): MediaImagePolicy {
  const local = isLocalImageUri(uri);
  const animated = isAnimatedImage(uri, mediaType);

  return {
    uri,
    cachePolicy: local ? "none" : surface === "feed" ? "disk" : "memory-disk",
    contentFit,
    allowDownscaling: true,
    enforceEarlyResizing: surface === "feed" && !local && !animated,
    recyclingKey: uri,
  };
}
