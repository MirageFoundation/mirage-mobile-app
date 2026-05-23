import * as Sentry from "@sentry/react-native";

export type LinkMeta = {
  title: string | null;
  description: string | null;
  image: string | null;
  video: string | null;
  audioUrl: string | null;
  audioUrls: string[];
  images: string[];
  videos: string[];
  siteName: string | null;
  domain: string;
  externalUrl: string | null;
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

function getFxTwitterUrl(url: string): string | null {
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

function getTweetId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^mobile\./, "");
    if (host !== "x.com" && host !== "twitter.com" && host !== "fxtwitter.com" && host !== "vxtwitter.com") {
      return null;
    }
    return parsed.pathname.match(/\/status(?:es)?\/(\d+)/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function applyTweetMedia(
  tweet: any,
  state: {
    images: string[];
    videos: string[];
    image: string | null;
    video: string | null;
  },
): { image: string | null; video: string | null } {
  const media = tweet?.media?.all ?? tweet?.media?.photos ?? tweet?.photos ?? [];
  for (const item of media) {
    const url = item?.url ?? item?.media_url_https ?? item?.media_url ?? item?.image_url ?? null;
    const thumbnail = item?.thumbnail_url ?? item?.thumb ?? item?.preview_image_url ?? null;
    const videoUrl = item?.url ?? item?.video_url ?? item?.variants?.find?.((v: any) => v?.type === "video/mp4")?.url ?? null;
    if ((item?.type === "video" || item?.type === "animated_gif" || item?.type === "gif") && videoUrl) {
      state.videos.push(videoUrl);
      if (!state.video) state.video = videoUrl;
      if (!state.image && thumbnail) state.image = thumbnail;
    } else if (url) {
      state.images.push(url);
      if (!state.image) state.image = url;
    }
  }
  const cardImage = tweet?.card?.image?.url ?? tweet?.card?.image ?? tweet?.thumbnail_url ?? null;
  if (cardImage) {
    state.images.push(cardImage);
    if (!state.image) state.image = cardImage;
  }
  if (state.images.length > 0 && !state.image) state.image = state.images[0];
  return { image: state.image, video: state.video };
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

async function resolveRedirectUrl(url: string, signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch(url, {
      signal,
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      redirect: "follow",
    });
    if (res.url && res.url !== url) return res.url;
  } catch {}

  try {
    const res = await fetch(url, {
      signal,
      method: "HEAD",
      headers: { "User-Agent": BROWSER_UA },
      redirect: "follow",
    });
    if (res.url && res.url !== url) return res.url;
  } catch {}

  return url;
}

function isRedditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^old\./, "");
    return host === "reddit.com" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

async function fetchRedditVideo(url: string, signal: AbortSignal): Promise<Partial<LinkMeta>> {
  try {
    let resolvedUrl = url;
    const needsRedirect = /redd\.it/i.test(url) || /\/s\/[a-zA-Z0-9]+/i.test(url);
    if (needsRedirect) {
      try {
        const redirectRes = await fetch(url, {
          signal,
          method: "HEAD",
          redirect: "follow",
          headers: { "User-Agent": BROWSER_UA },
        });
        if (redirectRes.url && redirectRes.url !== url) {
          resolvedUrl = redirectRes.url;
        }
      } catch (headErr) {
        Sentry.addBreadcrumb({ category: "link-meta", message: "Reddit HEAD redirect failed", data: { url, error: String(headErr) }, level: "warning" });
      }
      if (resolvedUrl === url) {
        try {
          const getRes = await fetch(url, {
            signal,
            redirect: "follow",
            headers: {
              "User-Agent": BROWSER_UA,
              Accept: "text/html",
            },
          });
          if (getRes.url && getRes.url !== url) {
            resolvedUrl = getRes.url;
          } else {
            const html = await getRes.text();
            const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]
              ?? html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1];
            if (canonical && canonical !== url) {
              resolvedUrl = canonical;
            }
          }
        } catch (getErr) {
          Sentry.addBreadcrumb({ category: "link-meta", message: "Reddit GET redirect fallback failed", data: { url, error: String(getErr) }, level: "warning" });
        }
      }
      Sentry.addBreadcrumb({
        category: "link-meta",
        message: "Reddit redirect resolution",
        data: { originalUrl: url, resolved: resolvedUrl !== url, resolvedUrl },
        level: resolvedUrl !== url ? "info" : "warning",
      });
      console.log("[fetchRedditVideo] Redirect resolution:", {
        method: resolvedUrl !== url ? "resolved" : "failed",
        needsFallback: resolvedUrl === url,
      });
    }
    console.log("[fetchRedditVideo] URL resolution:", {
      originalUrl: url,
      resolvedUrl,
      didRedirect: resolvedUrl !== url,
    });

    const jsonUrl = resolvedUrl.replace(/\?.*$/, "").replace(/\/$/, "") + ".json";

    let res = await fetch(jsonUrl, {
      signal,
      headers: {
        "User-Agent": "MirageApp/1.0",
        Accept: "application/json",
      },
      redirect: "follow",
    });
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await fetch(jsonUrl, {
        signal,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
        },
        redirect: "follow",
      });
    }
    if (!res.ok) {
      console.log("[fetchRedditVideo] JSON fetch failed:", { status: res.status, jsonUrl });
      Sentry.captureMessage("Reddit JSON fetch failed", {
        level: "warning",
        tags: { feature: "share-intent", domain: "reddit.com" },
        extra: { status: res.status, jsonUrl, originalUrl: url },
      });
      return {};
    }

    const raw = await res.text();
    if (!raw.trim()) {
      console.log("[fetchRedditVideo] JSON fetch returned empty body:", { jsonUrl });
      Sentry.captureMessage("Reddit JSON returned empty body", {
        level: "warning",
        tags: { feature: "share-intent", domain: "reddit.com" },
        extra: { jsonUrl, originalUrl: url, resolvedUrl },
      });
      return {};
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.log("[fetchRedditVideo] JSON parse failed:", { jsonUrl, error: String(parseErr) });
      Sentry.captureMessage("Reddit JSON parse failed", {
        level: "warning",
        tags: { feature: "share-intent", domain: "reddit.com" },
        extra: {
          jsonUrl,
          originalUrl: url,
          resolvedUrl,
          rawPreview: raw.slice(0, 300),
          error: String(parseErr),
        },
      });
      return {};
    }

    const listing = Array.isArray(data) ? data[0] : data;
    const post = listing?.data?.children?.[0]?.data;
    if (!post) {
      console.log("[fetchRedditVideo] No post data found in JSON response");
      Sentry.captureMessage("Reddit JSON returned no post data", {
        level: "warning",
        tags: { feature: "share-intent", domain: "reddit.com" },
        extra: { jsonUrl, originalUrl: url, listingKeys: Object.keys(listing?.data ?? {}) },
      });
      return {};
    }
    console.log("[fetchRedditVideo] Post data:", {
      title: post.title,
      url: post.url,
      domain: post.domain,
      isVideo: post.is_video,
      isSelf: post.is_self,
      isGallery: post.is_gallery,
      hasSecureMedia: !!post.secure_media,
      hasMedia: !!post.media,
      hasCrosspost: post.crosspost_parent_list?.length > 0,
      postHint: post.post_hint,
    });

    let videoUrl: string | null = null;
    let imageUrl: string | null = null;

    const redditVideo = post.secure_media?.reddit_video ?? post.media?.reddit_video;
    let audioUrl: string | null = null;
    let audioUrls: string[] = [];
    if (redditVideo) {
      videoUrl = redditVideo.fallback_url ?? redditVideo.dash_url ?? redditVideo.hls_url ?? null;
      if (videoUrl) {
        try {
          const vUrl = new URL(videoUrl);
          const pathParts = vUrl.pathname.split("/");
          const fileIdx = pathParts.findIndex((p) => /^(DASH_|CMAF_|HLS_)/i.test(p) || /\.(mp4|mpd|m3u8)$/i.test(p));
          const basePath = fileIdx > 0 ? pathParts.slice(0, fileIdx).join("/") + "/" : vUrl.pathname.replace(/\/[^/]+$/, "/");
          const base = `${vUrl.origin}${basePath}`;
          audioUrl = `${base}DASH_AUDIO_128.mp4`;
          audioUrls = [
            `${base}DASH_AUDIO_128.mp4`,
            `${base}DASH_AUDIO_64.mp4`,
            `${base}CMAF_AUDIO_128.mp4`,
            `${base}CMAF_AUDIO_64.mp4`,
            `${base}audio`,
            `${base}audio.mp4`,
          ];
        } catch {}
      }
    }

    if (!videoUrl && post.crosspost_parent_list?.length > 0) {
      const crosspost = post.crosspost_parent_list[0];
      const crossVideo = crosspost.secure_media?.reddit_video ?? crosspost.media?.reddit_video;
      if (crossVideo) {
        videoUrl = crossVideo.fallback_url ?? crossVideo.dash_url ?? crossVideo.hls_url ?? null;
        if (videoUrl && audioUrls.length === 0) {
          try {
            const vUrl = new URL(videoUrl);
            const pathParts = vUrl.pathname.split("/");
            const fileIdx = pathParts.findIndex((p) => /^(DASH_|CMAF_|HLS_)/i.test(p) || /\.(mp4|mpd|m3u8)$/i.test(p));
            const basePath = fileIdx > 0 ? pathParts.slice(0, fileIdx).join("/") + "/" : vUrl.pathname.replace(/\/[^/]+$/, "/");
            const base = `${vUrl.origin}${basePath}`;
            audioUrl = `${base}DASH_AUDIO_128.mp4`;
            audioUrls = [
              `${base}DASH_AUDIO_128.mp4`,
              `${base}DASH_AUDIO_64.mp4`,
              `${base}CMAF_AUDIO_128.mp4`,
              `${base}CMAF_AUDIO_64.mp4`,
              `${base}audio`,
              `${base}audio.mp4`,
            ];
          } catch {}
        }
      }
    }

    if (!videoUrl && post.preview?.reddit_video_preview) {
      videoUrl = post.preview.reddit_video_preview.fallback_url ?? null;
    }

    if (!videoUrl && post.preview?.images?.[0]?.variants?.mp4?.source?.url) {
      videoUrl = post.preview.images[0].variants.mp4.source.url.replace(/&amp;/g, "&");
    }

    if (!videoUrl && post.url && /\.gif(\?|$)/i.test(post.url)) {
      videoUrl = post.url;
    }

    if (post.preview?.images?.[0]?.source?.url) {
      imageUrl = post.preview.images[0].source.url.replace(/&amp;/g, "&");
    } else if (post.thumbnail && post.thumbnail !== "default" && post.thumbnail !== "self" && post.thumbnail !== "nsfw") {
      imageUrl = post.thumbnail;
    }

    const images: string[] = [];
    const videos: string[] = [];

    if (post.is_gallery && post.media_metadata && post.gallery_data?.items) {
      for (const item of post.gallery_data.items) {
        const mediaId = item.media_id;
        const media = post.media_metadata[mediaId];
        if (!media) continue;
        if (media.e === "Image" && media.s?.u) {
          images.push(media.s.u.replace(/&amp;/g, "&"));
        } else if (media.e === "AnimatedImage" && media.s?.gif) {
          images.push(media.s.gif.replace(/&amp;/g, "&"));
        } else if (media.e === "RedditVideo" && media.s?.mp4) {
          videos.push(media.s.mp4.replace(/&amp;/g, "&"));
        }
      }
    }

    if (images.length === 0 && post.preview?.images) {
      for (const img of post.preview.images) {
        if (img.source?.url) {
          const u = img.source.url.replace(/&amp;/g, "&");
          if (!images.includes(u)) images.push(u);
        }
      }
    }

    if (!imageUrl && !videoUrl && post.url && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(post.url)) {
      imageUrl = post.url;
    }

    if (images.length === 0 && imageUrl) {
      images.push(imageUrl);
    }

    if (videoUrl && !videos.includes(videoUrl)) {
      videos.unshift(videoUrl);
    }

    Sentry.addBreadcrumb({
      category: "link-meta",
      message: "Reddit meta extracted",
      data: { hasVideo: !!videoUrl, hasAudio: audioUrls.length > 0, imageCount: images.length, isGallery: !!post.is_gallery },
      level: "info",
    });

    console.log("[fetchRedditVideo] Extracted media:", {
      videoUrl,
      audioUrl,
      audioUrlsCount: audioUrls.length,
      imageUrl,
      imagesCount: images.length,
      videosCount: videos.length,
      postUrl: post.url,
    });

    return {
      title: post.title ?? null,
      description: post.selftext ?? null,
      image: images[0] ?? imageUrl,
      video: videoUrl,
      audioUrl,
      audioUrls,
      images,
      videos,
      siteName: "Reddit",
      externalUrl: !post.is_self && post.url && !post.url.startsWith("https://www.reddit.com") && !post.url.startsWith("https://reddit.com") && !post.url.startsWith("https://i.redd.it") && !post.url.startsWith("https://v.redd.it") ? post.url : null,
    };
  } catch (err) {
    Sentry.captureMessage("Reddit video extraction failed", {
      level: "warning",
      tags: { feature: "share-intent", domain: "reddit.com" },
      extra: { url, error: String(err) },
    });
    return {};
  }
}

function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
    return host === "instagram.com";
  } catch {
    return false;
  }
}

function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match?.[2] ?? null;
}

function extractInstagramImages(html: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  const addUrl = (raw: string) => {
    const cleaned = raw.replace(/\\/g, "").replace(/u0026/g, "&").replace(/u00253D/g, "=").replace(/&amp;/g, "&");
    const key = cleaned.split("?")[0];
    if (!seen.has(key) && cleaned.startsWith("https://")) {
      seen.add(key);
      images.push(cleaned);
    }
  };

  const displayUrlPattern = /display_url["\s:\\]+["']?(https?:[^"'\s,]+)/gi;
  let match;
  while ((match = displayUrlPattern.exec(html)) !== null) {
    addUrl(match[1]);
  }

  if (images.length === 0) {
    const sidecarPattern = /edge_sidecar_to_children[\s\S]*?edges[\s\S]*?\[([\s\S]*?)\]/;
    const sidecar = html.match(sidecarPattern);
    if (sidecar) {
      const urls = [...sidecar[1].matchAll(/display_url["\s:\\]+["']?(https?:[^"'\s,]+)/gi)];
      for (const u of urls) addUrl(u[1]);
    }
  }

  if (images.length <= 1) {
    const imgPattern = /https:\/\/scontent[a-z0-9.-]*\.cdninstagram\.com\/v\/[^\s"'\\]+\.jpg[^\s"'\\]*/gi;
    const scontentUrls = [...html.matchAll(imgPattern)];
    for (const m of scontentUrls) {
      const cleaned = m[0].replace(/\\/g, "").replace(/u0026/g, "&");
      if (/s\d{3,4}x\d{3,4}/.test(cleaned) || /dst-jpg/.test(cleaned)) {
        const key = cleaned.split("?")[0];
        if (!seen.has(key)) {
          seen.add(key);
          images.push(cleaned);
        }
      }
    }
  }

  return images;
}

function extractInstagramVideos(html: string): string[] {
  const videos: string[] = [];
  const seen = new Set<string>();

  const addUrl = (raw: string) => {
    const cleaned = raw
      .replace(/\\/g, "")
      .replace(/u0026/g, "&")
      .replace(/u00253D/g, "=")
      .replace(/&amp;/g, "&");
    if (!cleaned.startsWith("https://")) return;
    const key = cleaned.split("?")[0];
    if (seen.has(key)) return;
    seen.add(key);
    videos.push(cleaned);
  };

  const videoUrlPattern = /video_url[\"\s:\\]+[\"']?(https?:[^\"'\s,]+\.mp4[^\"'\s,]*)/gi;
  let match;
  while ((match = videoUrlPattern.exec(html)) !== null) {
    addUrl(match[1]);
  }

  const sourceSrcPattern = /<source[^>]+src=[\"']([^\"']+\.mp4[^\"']*)[\"']/gi;
  while ((match = sourceSrcPattern.exec(html)) !== null) {
    addUrl(match[1]);
  }

  const videoSrcPattern = /<video[^>]+src=[\"']([^\"']+\.mp4[^\"']*)[\"']/gi;
  while ((match = videoSrcPattern.exec(html)) !== null) {
    addUrl(match[1]);
  }

  if (videos.length === 0) {
    const mp4Pattern = /https?:\/\/[^\s\"'\\]+\.mp4[^\s\"'\\]*/gi;
    const all = [...html.matchAll(mp4Pattern)];
    for (const m of all) addUrl(m[0]);
  }

  return videos;
}

async function fetchInstagramMeta(url: string, signal: AbortSignal): Promise<Partial<LinkMeta>> {
  let embedImage: string | null = null;
  let embedCaption: string | null = null;
  let allImages: string[] = [];
  let allVideos: string[] = [];
  const shortcode = extractInstagramShortcode(url);

  if (shortcode) {
    try {
      const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
      const res = await fetch(embedUrl, {
        signal,
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html",
        },
        redirect: "follow",
      });
      if (res.ok) {
        const html = await res.text();

        let videoUrl: string | null = null;

        const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i)
          ?? html.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i);
        if (videoSrcMatch?.[1]) {
          videoUrl = videoSrcMatch[1].replace(/&amp;/g, "&");
        }

        const videoKeys = ["video_url", "video_versions", "contentUrl"];
        if (!videoUrl) {
          for (const key of videoKeys) {
            const keyIdx = html.indexOf(key);
            if (keyIdx === -1) continue;
            const afterKey = html.slice(keyIdx, keyIdx + 3000);
            const httpsIdx = afterKey.indexOf("https:");
            if (httpsIdx === -1) continue;
            const urlPart = afterKey.slice(httpsIdx);
            let endIdx = 0;
            for (let i = 0; i < urlPart.length && i < 2000; i++) {
              if (urlPart[i] === '"' || urlPart[i] === "'" || urlPart[i] === " " || urlPart[i] === "\n") {
                endIdx = i;
                break;
              }
            }
            if (endIdx > 0) {
              videoUrl = urlPart.slice(0, endIdx)
                .replace(/\\/g, "")
                .replace(/u0026/g, "&")
                .replace(/u00253D/g, "=");
              break;
            }
          }
        }

        if (!videoUrl) {
          const allHttps = [...html.matchAll(/https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/gi)];
          if (allHttps.length > 0) {
            videoUrl = allHttps[0][0].replace(/\\/g, "").replace(/u0026/g, "&");
          }
        }

        let imageUrl = getMeta(html, "image");
        if (!imageUrl) {
          const imgMatch = html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]+src=["']([^"']+)["']/i)
            ?? html.match(/<img[^>]+src=["'](https:\/\/scontent[^"']+)["']/i);
          if (imgMatch?.[1]) {
            imageUrl = imgMatch[1].replace(/&amp;/g, "&");
          }
        }

        const titleMatch = html.match(/<div[^>]*class="[^"]*Caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const caption = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 200) ?? null;

        const embedImages = extractInstagramImages(html);
        if (embedImages.length > 0) allImages = embedImages;

        const embedVideos = extractInstagramVideos(html);
        if (embedVideos.length > 0) allVideos = embedVideos;

        if (videoUrl) {
          if (allVideos.length === 0) allVideos = [videoUrl];
          else if (!allVideos.includes(videoUrl)) allVideos = [videoUrl, ...allVideos];
          Sentry.addBreadcrumb({
            category: "link-meta",
            message: "Instagram video extracted from embed",
            data: { shortcode, carouselCount: allImages.length, videoCount: allVideos.length },
            level: "info",
          });
          return {
            title: caption,
            description: null,
            image: imageUrl,
            video: videoUrl,
            videos: allVideos,
            images: allImages,
            siteName: "Instagram",
          };
        }

        embedImage = imageUrl;
        embedCaption = caption;
      }
    } catch (err) {
      Sentry.addBreadcrumb({
        category: "link-meta",
        message: "Instagram embed failed",
        data: { shortcode, error: String(err) },
        level: "warning",
      });
    }
  }

  try {
    const res = await fetch(url, {
      signal,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html",
      },
      redirect: "follow",
    });
    if (res.ok) {
      const html = await res.text();

      let videoUrl = getMeta(html, "video") ?? getMeta(html, "video:url") ?? getMeta(html, "video:secure_url");
      const imageUrl = getMeta(html, "image");
      const title = getMeta(html, "title");
      const description = getMeta(html, "description");

      if (!videoUrl) {
        const vidIdx = html.indexOf("video_url");
        if (vidIdx !== -1) {
          const afterKey = html.slice(vidIdx, vidIdx + 3000);
          const httpsIdx = afterKey.indexOf("https:");
          if (httpsIdx !== -1) {
            const urlPart = afterKey.slice(httpsIdx);
            let endIdx = 0;
            for (let i = 0; i < urlPart.length && i < 2000; i++) {
              if (urlPart[i] === '"' || urlPart[i] === "'" || urlPart[i] === " " || urlPart[i] === "\n") {
                endIdx = i;
                break;
              }
            }
            if (endIdx > 0) {
              videoUrl = urlPart.slice(0, endIdx).replace(/\\/g, "").replace(/u0026/g, "&").replace(/u00253D/g, "=");
            }
          }
        }
      }

      if (allImages.length === 0) {
        const pageImages = extractInstagramImages(html);
        if (pageImages.length > 0) allImages = pageImages;
      }

      if (allVideos.length === 0) {
        const pageVideos = extractInstagramVideos(html);
        if (pageVideos.length > 0) allVideos = pageVideos;
      }
      if (videoUrl && !allVideos.includes(videoUrl)) {
        allVideos = [videoUrl, ...allVideos];
      }

      Sentry.addBreadcrumb({
        category: "link-meta",
        message: "Instagram meta from direct page",
        data: { hasVideo: !!videoUrl, hasImage: !!imageUrl, carouselCount: allImages.length, videoCount: allVideos.length },
        level: "info",
      });

      return {
        title: title ?? embedCaption ?? null,
        description,
        image: imageUrl ?? embedImage ?? null,
        video: videoUrl,
        videos: allVideos,
        images: allImages,
        siteName: "Instagram",
      };
    }
  } catch (err) {
    Sentry.addBreadcrumb({
      category: "link-meta",
      message: "Instagram direct fetch failed",
      data: { error: String(err) },
      level: "warning",
    });
  }

  return {};
}

function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
    return host === "tiktok.com" || host === "vm.tiktok.com";
  } catch {
    return false;
  }
}

async function fetchTikTokMeta(url: string, signal: AbortSignal): Promise<Partial<LinkMeta>> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return {};
    const data = await res.json();

    let videoUrl: string | null = null;
    const embedHtml = data.html ?? "";
    const embedSrc = embedHtml.match(/src=["']([^"']+)["']/)?.[1];
    if (embedSrc) {
      try {
        const embedRes = await fetch(embedSrc, {
          signal,
          headers: { "User-Agent": BROWSER_UA },
          redirect: "follow",
        });
        const embedBody = await embedRes.text();
        const directVideo = embedBody.match(/"playAddr":"([^"]+)"/)?.[1]
          ?? embedBody.match(/"downloadAddr":"([^"]+)"/)?.[1];
        if (directVideo) {
          videoUrl = directVideo.replace(/\\u002F/g, "/");
        }
      } catch {}
    }

    return {
      title: data.title ?? null,
      description: data.author_name ? `by ${data.author_name}` : null,
      image: data.thumbnail_url ?? null,
      video: videoUrl,
      siteName: "TikTok",
    };
  } catch {
    return {};
  }
}

const OEMBED_PROVIDERS: Record<string, (url: string) => string> = {
  "youtube.com": (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  "youtu.be": (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  "vimeo.com": (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  "flickr.com": (url) => `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(url)}&format=json`,
  "soundcloud.com": (url) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  "spotify.com": (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
};

function getOembedUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").replace(/^m\./, "");
    for (const [domain, builder] of Object.entries(OEMBED_PROVIDERS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return builder(url);
    }
  } catch {}
  return null;
}

async function fetchOembed(url: string, signal: AbortSignal): Promise<Partial<LinkMeta>> {
  const oembedUrl = getOembedUrl(url);
  if (!oembedUrl) return {};
  try {
    const res = await fetch(oembedUrl, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: data.title ?? null,
      description: data.description ?? data.author_name ?? null,
      image: data.thumbnail_url ?? null,
      video: data.html?.match(/src=["']([^"']+)["']/)?.[1] ?? null,
      siteName: data.provider_name ?? null,
    };
  } catch {
    return {};
  }
}

const IGNORE_IMAGE_PATTERNS = /logo|icon|favicon|badge|avatar|emoji|pixel|tracking|spacer|button|banner-ad|sprite/i;
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i;

function extractImagesFromHtml(html: string, baseUrl: string): string | null {
  const candidates: { src: string; score: number }[] = [];

  const imgTags = html.match(/<img[^>]+>/gi) ?? [];
  for (const tag of imgTags) {
    const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
    if (!src || IGNORE_IMAGE_PATTERNS.test(src)) continue;

    let score = 0;
    const width = parseInt(tag.match(/width=["']?(\d+)/i)?.[1] ?? "0");
    const height = parseInt(tag.match(/height=["']?(\d+)/i)?.[1] ?? "0");
    if (width > 300 && height > 200) score += 5;
    else if (width > 100 && height > 100) score += 2;
    else if (width > 0 && width < 50) continue;

    if (/hero|featured|main|content|article|post|thumb/i.test(tag)) score += 3;
    if (IMAGE_EXTENSIONS.test(src)) score += 1;

    const resolved = resolveUrl(src, baseUrl);
    if (resolved) candidates.push({ src: resolved, score });
  }

  const pictureSourceTags = html.match(/<source[^>]+srcset=["'][^"']+["'][^>]*>/gi) ?? [];
  for (const tag of pictureSourceTags) {
    const srcset = tag.match(/srcset=["']([^"']+)["']/i)?.[1];
    if (!srcset) continue;
    const firstSrc = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    if (firstSrc && !IGNORE_IMAGE_PATTERNS.test(firstSrc)) {
      const resolved = resolveUrl(firstSrc, baseUrl);
      if (resolved) candidates.push({ src: resolved, score: 2 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.src ?? null;
}

function extractVideosFromHtml(html: string, baseUrl: string): string | null {
  const videoSrcMatch = html.match(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/i);
  if (videoSrcMatch?.[1]) {
    const resolved = resolveUrl(videoSrcMatch[1], baseUrl);
    if (resolved) return resolved;
  }

  const videoDirectMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (videoDirectMatch?.[1]) {
    const resolved = resolveUrl(videoDirectMatch[1], baseUrl);
    if (resolved) return resolved;
  }

  const iframeSrc = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  if (iframeSrc && /youtube|vimeo|dailymotion|streamable/i.test(iframeSrc)) {
    return resolveUrl(iframeSrc, baseUrl);
  }

  return null;
}

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    if (src.startsWith("data:")) return null;
    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http")) return src;
    return new URL(src, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): Partial<LinkMeta> {
  const match = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};
  try {
    const data = JSON.parse(match[1]);
    const item = Array.isArray(data) ? data[0] : data;
    return {
      title: item.headline ?? item.name ?? null,
      description: item.description ?? null,
      image: typeof item.image === "string" ? item.image : item.image?.url ?? item.thumbnailUrl ?? null,
      video: item.contentUrl ?? item.embedUrl ?? null,
    };
  } catch {
    return {};
  }
}

export async function fetchLinkMeta(url: string): Promise<LinkMeta> {
  let resolvedUrl = url;
  let domain = new URL(url).hostname.replace(/^www\./, "");
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    if (domain === "share.google") {
      resolvedUrl = await resolveRedirectUrl(url, controller.signal);
      domain = new URL(resolvedUrl).hostname.replace(/^www\./, "");
      Sentry.addBreadcrumb({
        category: "link-meta",
        message: "Resolved shared redirect URL",
        data: { originalDomain: "share.google", resolvedDomain: domain, resolved: resolvedUrl !== url },
        level: "info",
      });
    }

    let title: string | null = null;
    let description: string | null = null;
    let image: string | null = null;
    let video: string | null = null;
    let audioUrl: string | null = null;
    let audioUrls: string[] = [];
    let images: string[] = [];
    let videos: string[] = [];
    let siteName: string | null = null;
    let externalUrl: string | null = null;

    if (isRedditUrl(resolvedUrl)) {
      const reddit = await fetchRedditVideo(resolvedUrl, controller.signal);
      title = reddit.title ?? null;
      description = reddit.description ?? null;
      image = reddit.image ?? null;
      video = reddit.video ?? null;
      audioUrl = reddit.audioUrl ?? null;
      audioUrls = reddit.audioUrls ?? [];
      images = reddit.images ?? [];
      videos = reddit.videos ?? [];
      siteName = reddit.siteName ?? null;
      externalUrl = reddit.externalUrl ?? null;
    }

    if (isInstagramUrl(resolvedUrl) && !video) {
      const ig = await fetchInstagramMeta(resolvedUrl, controller.signal);
      if (ig.title) title = title ?? ig.title;
      if (ig.description) description = description ?? ig.description;
      if (ig.image) image = image ?? ig.image;
      if (ig.video) video = ig.video;
      if (ig.images?.length) images = ig.images;
      if (ig.videos?.length) videos = ig.videos;
      siteName = siteName ?? ig.siteName ?? null;
    }

    if (isTikTokUrl(resolvedUrl) && !video) {
      const tt = await fetchTikTokMeta(resolvedUrl, controller.signal);
      if (tt.title) title = title ?? tt.title;
      if (tt.description) description = description ?? tt.description;
      if (tt.image) image = image ?? tt.image;
      if (tt.video) video = tt.video;
      siteName = siteName ?? tt.siteName ?? null;
    }

    const fxUrl = getFxTwitterUrl(resolvedUrl);
    let html: string | null = null;
    let shouldSkipGenericHtmlFallback = false;

    if (fxUrl) {
      try {
        const tweetId = getTweetId(resolvedUrl);
        if (tweetId) {
          try {
            const syndicationRes = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en`, {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            });
            if (syndicationRes.ok) {
              const tweet = await syndicationRes.json();
              const tweetText = tweet?.text ?? tweet?.full_text ?? "";
              const tweetLines = tweetText.split("\n").filter((line: string) => line.trim().length > 0);
              if (!title) title = tweetLines[0]?.trim() ?? null;
              if (!description) description = tweetLines.length > 1 ? tweetLines.slice(1).join("\n").trim() : tweetText || null;
              if (!siteName) siteName = "X";
              const mediaState = applyTweetMedia(tweet, { images, videos, image, video });
              image = mediaState.image;
              video = mediaState.video;
              Sentry.addBreadcrumb({
                category: "link-meta",
                message: "Fetched X metadata from syndication API",
                data: {
                  tweetId,
                  hasTitle: !!title,
                  hasImage: !!image,
                  hasVideo: !!video,
                  imageCount: images.length,
                  videoCount: videos.length,
                },
                level: "info",
              });
            }
          } catch (syndicationErr) {
            Sentry.addBreadcrumb({
              category: "link-meta",
              message: "X syndication metadata failed",
              data: { tweetId, error: String(syndicationErr) },
              level: "warning",
            });
          }
        }

        const apiUrl = fxUrl.replace("fxtwitter.com", "api.fxtwitter.com");
        try {
          const apiRes = await fetch(apiUrl, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            const tweet = apiData?.tweet;
            if (tweet) {
              const tweetText = tweet.text ?? "";
              const tweetLines = tweetText.split("\n").filter((l: string) => l.trim().length > 0);
              if (!title) title = tweetLines[0]?.trim() ?? null;
              if (!description) description = tweetLines.length > 1 ? tweetLines.slice(1).join("\n").trim() : tweetText || null;
              if (!siteName) siteName = "X";
              const mediaState = applyTweetMedia(tweet, { images, videos, image, video });
              image = mediaState.image;
              video = mediaState.video;
              shouldSkipGenericHtmlFallback = !!(title || description || image || video);
              console.log("[fetchLinkMeta] X API metadata:", {
                hasTitle: !!title,
                hasDescription: !!description,
                hasImage: !!image,
                hasVideo: !!video,
                imageCount: images.length,
                videoCount: videos.length,
              });
            }
          }
        } catch {}

        if (!title || !description) {
          html = await fetchHtml(fxUrl, controller.signal, true);
          if (!title) title = getMeta(html, "title");
          if (!description) description = getMeta(html, "description");
          if (!image) image = getMeta(html, "image");
          if (!video) video = getMeta(html, "video") ?? getMeta(html, "video:url") ?? getMeta(html, "video:secure_url");
          if (!siteName) siteName = getMeta(html, "site_name") ?? "X";
        }
      } catch {
        if (!title && !description && !image && !video) {
          html = await fetchHtml(resolvedUrl, controller.signal);
        }
      }
    }

    if (!shouldSkipGenericHtmlFallback && (!title || !description || !image || !video)) {
      if (!html) html = await fetchHtml(resolvedUrl, controller.signal);

      if (!title) title = getMeta(html, "title");
      if (!description) description = getMeta(html, "description");
      if (!image) image = getMeta(html, "image");
      if (!video) video = getMeta(html, "video") ?? getMeta(html, "video:url") ?? getMeta(html, "video:secure_url");
      if (!siteName) siteName = getMeta(html, "site_name");

      if (!title) {
        title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
      }

      if (!image || !title || !video) {
        const jsonLd = extractJsonLd(html);
        if (!title && jsonLd.title) title = jsonLd.title;
        if (!description && jsonLd.description) description = jsonLd.description;
        if (!image && jsonLd.image) image = jsonLd.image;
        if (!video && jsonLd.video) video = jsonLd.video;
      }

      if (!image) {
        image = extractImagesFromHtml(html, resolvedUrl);
      }

      if (!video) {
        video = extractVideosFromHtml(html, resolvedUrl);
      }
    }

    if (!image || !video) {
      const oembed = await fetchOembed(resolvedUrl, controller.signal);
      if (!title && oembed.title) title = oembed.title;
      if (!description && oembed.description) description = oembed.description;
      if (!image && oembed.image) image = oembed.image;
      if (!video && oembed.video) video = oembed.video;
      if (!siteName && oembed.siteName) siteName = oembed.siteName;
    }

    clearTimeout(timeout);

    if (!video) {
      const gifInImages = images.find((u) => /\.gif(\?|$)/i.test(u));
      if (gifInImages) {
        video = gifInImages;
        videos.unshift(gifInImages);
        images = images.filter((u) => u !== gifInImages);
      } else if (image && /\.gif(\?|$)/i.test(image)) {
        video = image;
        videos.unshift(image);
        image = null;
      }
    }

    const decodeHtml = (s: string | null) =>
      s?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'") ?? null;

    if (image && images.length === 0) images.push(image);
    if (video && videos.length === 0) videos.push(video);

    Sentry.addBreadcrumb({
      category: "link-meta",
      message: "Link meta fetched",
      data: {
        domain,
        hasTitle: !!title,
        hasVideo: !!video,
        hasImage: !!image,
        imageCount: images.length,
        videoCount: videos.length,
        hasAudio: audioUrls.length > 0,
      },
      level: "info",
    });

    return {
      title: decodeHtml(title),
      description: decodeHtml(description),
      image: decodeHtml(image),
      video: decodeHtml(video),
      audioUrl: decodeHtml(audioUrl),
      audioUrls: audioUrls.map((u) => decodeHtml(u)!),
      images: images.map((u) => decodeHtml(u)!),
      videos: videos.map((u) => decodeHtml(u)!),
      siteName: decodeHtml(siteName),
      domain,
      externalUrl: decodeHtml(externalUrl),
    };
  } catch (err) {
    Sentry.captureMessage("fetchLinkMeta failed completely", {
      level: "warning",
      tags: { feature: "share-intent", domain },
      extra: { url, error: String(err) },
    });
    return { title: null, description: null, image: null, video: null, audioUrl: null, audioUrls: [], images: [], videos: [], siteName: null, domain, externalUrl: null };
  }
}
