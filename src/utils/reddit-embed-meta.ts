export type RedditEmbedMeta = {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  externalUrl: string | null;
};

type PackagedMediaSource = {
  url?: unknown;
  dimensions?: {
    width?: unknown;
    height?: unknown;
  };
};

type PackagedMedia = {
  playbackMp4s?: {
    permutations?: {
      source?: PackagedMediaSource;
    }[];
  };
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function extractAttribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedName}=["']([^"']*)["']`, "i"));
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

function textFromHtml(value: string | null): string | null {
  if (!value) return null;
  const text = decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function getPackagedVideoUrl(playerTag: string): string | null {
  const packagedJson = extractAttribute(playerTag, "packaged-media-json");
  if (!packagedJson) return null;

  try {
    const packaged = JSON.parse(packagedJson) as PackagedMedia;
    const candidates = packaged.playbackMp4s?.permutations
      ?.map(({ source }) => {
        const width = typeof source?.dimensions?.width === "number" ? source.dimensions.width : 0;
        const height = typeof source?.dimensions?.height === "number" ? source.dimensions.height : 0;
        return {
          url: typeof source?.url === "string" ? source.url : null,
          pixels: width * height,
        };
      })
      .filter((candidate): candidate is { url: string; pixels: number } => !!candidate.url)
      .sort((a, b) => b.pixels - a.pixels);
    return candidates?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

function getExternalUrl(html: string): string | null {
  const screenviewTag = html.match(/<shreddit-screenview-data\b[^>]*>/i)?.[0];
  const screenviewJson = screenviewTag ? extractAttribute(screenviewTag, "data") : null;
  if (!screenviewJson) return null;

  try {
    const data = JSON.parse(screenviewJson) as { post?: { url?: unknown } };
    const postUrl = typeof data.post?.url === "string" ? data.post.url : null;
    if (!postUrl) return null;
    const host = new URL(postUrl).hostname.replace(/^www\./, "");
    if (host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it" || host.endsWith(".redd.it")) {
      return null;
    }
    return postUrl;
  } catch {
    return null;
  }
}

export function getRedditEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `https://embed.reddit.com${parsed.pathname}?ref_source=embed&ref=share&embed=true`;
  } catch {
    return null;
  }
}

export function extractRedditEmbedMeta(html: string): RedditEmbedMeta {
  const titleBlock = html.match(/<a\b[^>]*\bid=["']embed-title["'][^>]*>[\s\S]*?<\/a>/i)?.[0] ?? null;
  const titleHtml = titleBlock?.match(/<(?:h1|shreddit-embed-title)\b[^>]*>([\s\S]*?)<\/(?:h1|shreddit-embed-title)>/i)?.[1] ?? null;
  const descriptionHtml = html.match(/<div\b[^>]*\bid=["'][^"']*-post-rtjson-content["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? null;
  const playerTag = html.match(/<shreddit-player\b[^>]*>/i)?.[0] ?? null;

  const packagedVideo = playerTag ? getPackagedVideoUrl(playerTag) : null;
  const previewVideo = playerTag ? extractAttribute(playerTag, "preview") : null;
  const playerVideo = playerTag ? extractAttribute(playerTag, "src") : null;

  return {
    title: textFromHtml(titleHtml),
    description: textFromHtml(descriptionHtml),
    image: playerTag ? extractAttribute(playerTag, "poster") : null,
    video: packagedVideo ?? previewVideo ?? playerVideo,
    externalUrl: getExternalUrl(html),
  };
}
