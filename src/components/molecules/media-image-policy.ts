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
  displayWidth?: number;
};

const SIGNED_QUERY_KEYS = new Set([
  "expires",
  "key-pair-id",
  "policy",
  "sig",
  "signature",
  "token",
]);

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

function getFeedThumbnailUri(uri: string, displayWidth?: number): string {
  if (!displayWidth || !Number.isFinite(displayWidth) || displayWidth <= 0) return uri;

  try {
    const url = new URL(uri);
    const isCloudflareStreamThumbnail =
      url.hostname.toLowerCase() === "videodelivery.net" &&
      /^\/[a-z0-9]+\/thumbnails\/thumbnail\.jpg$/i.test(url.pathname);
    const hasSignature = Array.from(url.searchParams.keys()).some((key) =>
      SIGNED_QUERY_KEYS.has(key.toLowerCase()),
    );
    if (!isCloudflareStreamThumbnail || hasSignature) return uri;

    const requestedWidth = Math.min(960, Math.max(320, Math.ceil(displayWidth * 2)));
    url.searchParams.set("width", String(requestedWidth));
    return url.toString();
  } catch {
    return uri;
  }
}

export function getMediaImagePolicy({
  uri,
  surface,
  mediaType = "unknown",
  contentFit = "cover",
  displayWidth,
}: MediaImagePolicyInput): MediaImagePolicy {
  const local = isLocalImageUri(uri);
  const animated = isAnimatedImage(uri, mediaType);
  const resolvedUri =
    surface === "feed" && mediaType === "poster"
      ? getFeedThumbnailUri(uri, displayWidth)
      : uri;

  return {
    uri: resolvedUri,
    cachePolicy: local ? "none" : surface === "feed" ? "disk" : "memory-disk",
    contentFit,
    allowDownscaling: true,
    enforceEarlyResizing: surface === "feed" && !local && !animated,
    recyclingKey: resolvedUri,
  };
}
