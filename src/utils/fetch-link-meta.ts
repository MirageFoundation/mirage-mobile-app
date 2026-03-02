export type LinkMeta = {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  siteName: string | null;
  domain: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function getMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']twitter:${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:${property}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function useFxTwitter(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname === "x.com" ||
      parsed.hostname === "www.x.com" ||
      parsed.hostname === "twitter.com" ||
      parsed.hostname === "www.twitter.com"
    ) {
      parsed.hostname = "fxtwitter.com";
      return parsed.toString();
    }
  } catch {}
  return null;
}

async function fetchHtml(url: string, signal: AbortSignal, useBot = false): Promise<string> {
  const res = await fetch(url, {
    signal,
    headers: {
      "User-Agent": useBot ? "bot" : BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  return res.text();
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const fxUrl = useFxTwitter(url);
    let html: string;
    let title: string | null = null;
    let description: string | null = null;
    let image: string | null = null;
    let video: string | null = null;
    let siteName: string | null = null;

    if (fxUrl) {
      try {
        html = await fetchHtml(fxUrl, controller.signal, true);
        title = getMeta(html, "title");
        description = getMeta(html, "description");
        image = getMeta(html, "image");
        video = getMeta(html, "video") ?? getMeta(html, "video:url") ?? getMeta(html, "video:secure_url");
        siteName = getMeta(html, "site_name") ?? "X";
      } catch {
        html = await fetchHtml(url, controller.signal);
      }
    } else {
      html = await fetchHtml(url, controller.signal);
    }

    if (!title) title = getMeta(html!, "title");
    if (!description) description = getMeta(html!, "description");
    if (!image) image = getMeta(html!, "image");
    if (!video) video = getMeta(html!, "video") ?? getMeta(html!, "video:url") ?? getMeta(html!, "video:secure_url");
    if (!siteName) siteName = getMeta(html!, "site_name");

    if (!title) {
      title = html!.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
    }

    if (!image && video) {
      image = getMeta(html!, "image") ?? getMeta(html!, "image:src");
    }

    clearTimeout(timeout);

    const decodeHtml = (s: string | null) =>
      s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") ?? null;

    return {
      title: decodeHtml(title),
      description: decodeHtml(description),
      image: decodeHtml(image),
      video: decodeHtml(video),
      siteName: decodeHtml(siteName),
      domain,
    };
  } catch {
    return { title: null, description: null, image: null, video: null, siteName: null, domain };
  }
}
