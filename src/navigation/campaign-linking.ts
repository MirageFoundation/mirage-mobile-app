import { isMirageHost, isMirageScheme } from "@/src/navigation/route-map";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type CampaignUtmKey = (typeof UTM_KEYS)[number];

export type CampaignParams = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

function splitPathAndSearch(value: string): { pathname: string; search: string } {
  const withoutHash = value.split("#", 1)[0] ?? value;
  const [rawPathname, rawSearch = ""] = withoutHash.split("?", 2);
  const pathname = rawPathname.startsWith("/")
    ? rawPathname
    : `/${rawPathname}`;
  return {
    pathname,
    search: rawSearch ? `?${rawSearch}` : "",
  };
}

function readNonEmptyParam(
  params: URLSearchParams,
  key: string,
): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

export function campaignParamsFromSearch(search: string): CampaignParams | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const fields: CampaignParams = {};
  const ref = readNonEmptyParam(params, "ref");
  if (ref) fields.ref = ref;
  for (const key of UTM_KEYS) {
    const value = readNonEmptyParam(params, key);
    if (value) fields[key] = value;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

export function isTrustedCampaignLocation(
  value: string,
  additionalHosts: string[] = [],
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.replace(/:$/, "");
    if (isMirageScheme(scheme)) return true;
    return isMirageHost(url.hostname, additionalHosts);
  } catch {
    if (trimmed.includes("://")) return false;
    return trimmed.startsWith("/") || trimmed.startsWith("(");
  }
}

export function extractCampaignParams(
  value: string,
  additionalHosts: string[] = [],
): CampaignParams | null {
  const trimmed = value.trim();
  if (!trimmed || !isTrustedCampaignLocation(trimmed, additionalHosts)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return campaignParamsFromSearch(url.search);
  } catch {
    const { search } = splitPathAndSearch(trimmed);
    return campaignParamsFromSearch(search);
  }
}
