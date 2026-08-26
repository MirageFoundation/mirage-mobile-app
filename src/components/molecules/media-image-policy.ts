export type MediaImageSurface = "feed" | "detail";
export type MediaImageType = "image" | "gif" | "poster" | "unknown";
export type MediaImagePriority = "low" | "normal" | "high";

export type MediaImageSource = {
  uri: string;
  width?: number;
  height?: number;
};

export type MediaImagePolicy = {
  uri: string;
  cachePolicy: "none" | "disk" | "memory-disk";
  contentFit: "cover" | "contain";
  allowDownscaling: boolean;
  enforceEarlyResizing: boolean;
  recyclingKey: string;
  priority: MediaImagePriority;
  sourceWidth?: number;
  sourceHeight?: number;
};

type MediaImagePolicyInput = {
  uri: string;
  surface: MediaImageSurface;
  mediaType?: MediaImageType;
  contentFit?: "cover" | "contain";
  /**
   * Kept for call-site stability; server-side thumbnail resizing is not
   * available on the current CDN, so downscaling happens client-side via
   * `allowDownscaling` plus source width/height when we know them.
   */
  displayWidth?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  visible?: boolean;
};

function isLocalImageUri(uri: string): boolean {
  return /^(asset|blob|content|data|file):/i.test(uri);
}

export function getMediaImageSource(policy: MediaImagePolicy): MediaImageSource {
  if (policy.sourceWidth && policy.sourceHeight) {
    return {
      uri: policy.uri,
      width: policy.sourceWidth,
      height: policy.sourceHeight,
    };
  }
  return { uri: policy.uri };
}

export function getMediaImagePolicy({
  uri,
  surface,
  contentFit = "cover",
  intrinsicWidth,
  intrinsicHeight,
  visible,
}: MediaImagePolicyInput): MediaImagePolicy {
  const local = isLocalImageUri(uri);

  return {
    uri,
    cachePolicy: local ? "none" : "memory-disk",
    contentFit,
    allowDownscaling: true,
    // iOS-only and a no-op on Android. Leaving it off avoids a decode path
    // that can paint a partial bitmap, then stay stuck until remount.
    enforceEarlyResizing: false,
    recyclingKey: uri,
    priority: visible === false && surface === "feed" ? "normal" : "high",
    sourceWidth: intrinsicWidth,
    sourceHeight: intrinsicHeight,
  };
}
