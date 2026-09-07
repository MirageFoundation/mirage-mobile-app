import { normalizeServerBaseUrl } from "@/src/api/server-runtime";
import { getVisitorId } from "@/src/services/visitor-identity";

export const MIRAGE_VISITOR_HEADER = "X-Mirage-Visitor";
export const MIRAGE_PLATFORM_HEADER = "X-Mirage-Platform";

export type MiragePlatform = "ios" | "android";

export type MirageRequestHeaders = {
  [MIRAGE_VISITOR_HEADER]: string;
  [MIRAGE_PLATFORM_HEADER]?: MiragePlatform;
};

type HeaderBag = {
  set?: (name: string, value: string) => void;
  delete?: (name: string) => void;
  [name: string]: unknown;
};

export type MirageAxiosRequestConfig = {
  url?: string;
  baseURL?: string;
  headers?: HeaderBag;
  beforeRedirect?: (
    options: MirageRedirectOptions,
    responseDetails?: unknown,
  ) => void;
  mirageTrustedOrigins?: string[];
};

export type MirageRedirectOptions = {
  href?: string;
  protocol?: string;
  hostname?: string;
  host?: string;
  pathname?: string;
  headers?: HeaderBag;
};

let platformOverride: string | null | undefined;

export function configureMiragePlatformForTests(os?: string | null): void {
  platformOverride = os;
}

function readPlatformOS(): string {
  if (platformOverride !== undefined) return platformOverride ?? "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require("react-native") as { Platform?: { OS?: string } };
    return Platform?.OS ?? "";
  } catch {
    return "";
  }
}

export function getMiragePlatform(): MiragePlatform | null {
  const os = readPlatformOS();
  if (os === "ios" || os === "android") return os;
  return null;
}

export function getMirageRequestHeaders(): MirageRequestHeaders {
  const headers: MirageRequestHeaders = {
    [MIRAGE_VISITOR_HEADER]: getVisitorId(),
  };
  const platform = getMiragePlatform();
  if (platform) headers[MIRAGE_PLATFORM_HEADER] = platform;
  return headers;
}

export function applyMirageRequestHeaders(
  headers?: Record<string, string> | null,
): Record<string, string> {
  return {
    ...(headers ?? {}),
    ...getMirageRequestHeaders(),
  };
}

export function resolveAxiosRequestUrl(config: {
  url?: string;
  baseURL?: string;
}): string | null {
  const url = config.url?.trim();
  if (!url) return null;
  try {
    return new URL(url, config.baseURL).toString();
  } catch {
    return null;
  }
}

export function isTrustedMirageApiDestination(
  rawUrl: string,
  trustedOrigins: readonly string[],
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const trusted = new Set(
    trustedOrigins
      .map((origin) => {
        try {
          return normalizeServerBaseUrl(origin);
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => !!origin),
  );

  let requestOrigin: string;
  try {
    requestOrigin = normalizeServerBaseUrl(parsed.origin);
  } catch {
    return false;
  }
  if (!trusted.has(requestOrigin)) return false;

  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function stripMirageIdentityHeaders(headers: unknown): void {
  if (!headers || typeof headers !== "object") return;
  const bag = headers as HeaderBag;
  for (const name of [MIRAGE_VISITOR_HEADER, MIRAGE_PLATFORM_HEADER]) {
    if (typeof bag.delete === "function") {
      try {
        bag.delete(name);
      } catch {
        // Continue with property deletion for plain objects.
      }
    }
    delete bag[name];
  }
}

function assignHeaders(target: HeaderBag, headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (typeof target.set === "function") {
      target.set(name, value);
    } else {
      target[name] = value;
    }
  }
}

function resolveRedirectUrl(options: MirageRedirectOptions): string | null {
  if (options.href) return options.href;
  const protocol = options.protocol?.replace(/:$/, "");
  const host = options.host ?? options.hostname;
  if (!protocol || !host) return null;
  return `${protocol}://${host}${options.pathname ?? ""}`;
}

export function applyMirageRedirectGuard(
  options: MirageRedirectOptions,
  trustedOrigins: readonly string[],
): void {
  const nextUrl = resolveRedirectUrl(options);
  if (!nextUrl || !isTrustedMirageApiDestination(nextUrl, trustedOrigins)) {
    stripMirageIdentityHeaders(options.headers);
  }
}

export function applyMirageIdentityToAxiosRequest<
  T extends MirageAxiosRequestConfig,
>(config: T, trustedOrigins: readonly string[]): T {
  const extraOrigins = Array.isArray(config.mirageTrustedOrigins)
    ? config.mirageTrustedOrigins
    : [];
  const origins = [...trustedOrigins, ...extraOrigins];
  const resolved = resolveAxiosRequestUrl(config);
  if (!resolved || !isTrustedMirageApiDestination(resolved, origins)) {
    stripMirageIdentityHeaders(config.headers);
    return config;
  }

  if (!config.headers || typeof config.headers !== "object") {
    config.headers = {};
  }
  assignHeaders(config.headers, getMirageRequestHeaders());

  const previous = config.beforeRedirect;
  config.beforeRedirect = (options, responseDetails) => {
    previous?.(options, responseDetails);
    applyMirageRedirectGuard(options, origins);
  };
  return config;
}
