export type AvatarImageFormat = "svg" | "raster" | "unknown";

export type AvatarSourcePolicy<T> =
  | {
      kind: "custom";
      format: AvatarImageFormat;
      source: T;
    }
  | {
      kind: "generated-svg";
      cacheKey: string;
      fallback: boolean;
      uri: string;
    };

const DICEBEAR_BASE = "https://api.dicebear.com/9.x";

export function buildDicebearSvgUrl(seed: string | undefined): string {
  const rawSeed = seed === null || seed === undefined ? "" : String(seed);
  const safeSeed = encodeURIComponent(rawSeed || "default");
  return `${DICEBEAR_BASE}/identicon/svg?seed=${safeSeed}&backgroundColor=transparent`;
}

export function getAvatarImageFormat(uri: string | undefined): AvatarImageFormat {
  if (!uri) return "unknown";
  const normalized = uri.toLowerCase().split(/[?#]/, 1)[0];
  if (normalized.startsWith("data:image/svg+xml") || normalized.endsWith(".svg")) {
    return "svg";
  }
  if (/\.(?:avif|gif|jpe?g|png|webp)$/.test(normalized) ||
      /^data:image\/(?:avif|gif|jpeg|png|webp)/.test(normalized)) {
    return "raster";
  }
  return "unknown";
}

function getSourceUri(source: unknown): string | undefined {
  if (!source || typeof source !== "object" || !("uri" in source)) return undefined;
  const uri = (source as { uri?: unknown }).uri;
  return typeof uri === "string" ? uri : undefined;
}

export function getAvatarSourcePolicy<T>(
  source: T | undefined,
  seed: string | undefined,
): AvatarSourcePolicy<T> {
  if (source) {
    return {
      kind: "custom",
      format: getAvatarImageFormat(getSourceUri(source)),
      source,
    };
  }

  const uri = buildDicebearSvgUrl(seed);
  return {
    kind: "generated-svg",
    cacheKey: uri,
    fallback: !seed,
    uri,
  };
}

export function getAvatarSvgRenderKey(cacheKey: string, size: number): string {
  return `${cacheKey}#${size}`;
}
