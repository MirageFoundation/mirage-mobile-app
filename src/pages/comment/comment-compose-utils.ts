export type InputMode = "keyboard" | "link" | "gif" | "photo";

export type CommentImageUploadState = {
  uploading: boolean;
  done: boolean;
  error: string | null;
  url: string | null;
};

export const URL_REGEX = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;
export const HTTP_URL_REGEX = /^https?:\/\//i;

export function looksLikeUrlWithoutProtocol(text: string): boolean {
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(text) &&
    !text.startsWith("http")
  );
}

const MARKDOWN_LINK_EXTRACT = /\[([^\]]+)\]\(([^)]+)\)/g;

export function extractMarkdownLinks(text: string): { name: string; url: string }[] {
  const links: { name: string; url: string }[] = [];
  let match: RegExpExecArray | null;
  MARKDOWN_LINK_EXTRACT.lastIndex = 0;
  while ((match = MARKDOWN_LINK_EXTRACT.exec(text)) !== null) {
    links.push({ name: match[1], url: match[2] });
  }
  return links;
}

const IMAGE_URL_REGEX = /^(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))$/i;
const CLOUDFLARE_IMAGE_REGEX = /^https?:\/\/imagedelivery\.net\/[^\s]+$/i;
export const GIPHY_URL_REGEX =
  /^https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

function isImageUrl(url: string): boolean {
  return (
    IMAGE_URL_REGEX.test(url) ||
    CLOUDFLARE_IMAGE_REGEX.test(url) ||
    GIPHY_URL_REGEX.test(url)
  );
}

export function extractImageUrls(content: string): {
  text: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  const textLines: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (isImageUrl(trimmed)) {
      imageUrls.push(trimmed);
    } else {
      textLines.push(line);
    }
  }
  return { text: textLines.join("\n").trim(), imageUrls };
}
