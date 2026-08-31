import { MIRAGE_NODE } from "./env";

const TIMEOUT_MS = 20_000;

type QueryValue = string | number | boolean | null | undefined | QueryValue[];
export type Query = Record<string, QueryValue>;

export interface ApiResponse {
  url: string;
  status: number;
  ok: boolean;
  body: unknown;
}

function appendQuery(url: URL, query: Query): void {
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined && value !== null) url.searchParams.append(key, String(value));
    }
  }
}

export function normalizeApiPath(path: string): string {
  const normalized = path.trim().replace(/^\/+/, "").replace(/^api\//, "");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    normalized.includes(":")
  ) {
    throw new Error("path must be a relative endpoint under /api/");
  }
  return normalized;
}

export async function apiGet(path: string, query: Query = {}): Promise<ApiResponse> {
  const endpoint = normalizeApiPath(path);
  const url = new URL(`/api/${endpoint}`, `${MIRAGE_NODE}/`);
  appendQuery(url, query);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        // Preserve non-JSON response bodies for diagnostics.
      }
    } else {
      body = null;
    }

    return { url: url.toString(), status: response.status, ok: response.ok, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(`Mirage node request failed: ${message}`);
  }
}
