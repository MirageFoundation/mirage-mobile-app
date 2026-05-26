import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { parseApiError } from "@/src/utils/parse-api-error";

// Strict URL validation - requires protocol (http:// or https://)
export const URL_REGEX = /^https?:\/\/[^\s<>"{}|\\^`\[\]]+$/i;

export const CONTENT_WARNING_OPTIONS: { value: ContentTag; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "adult", label: "Adult" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

export function looksLikeUrlWithoutProtocol(text: string): boolean {
  return (
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+/i.test(text) &&
    !text.startsWith("http")
  );
}

export function getPostFailureDetails(error: unknown): string {
  const parsed = parseApiError(error);
  const backendMessage = (error as any)?.response?.data?.error;
  const message = typeof backendMessage === "string" && backendMessage.trim().length > 0
    ? backendMessage.trim()
    : parsed.message;

  return parsed.errorCode ? `${parsed.errorCode}: ${message}` : message;
}
