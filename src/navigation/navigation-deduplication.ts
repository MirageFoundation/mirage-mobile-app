export type NavigationAction = "push" | "navigate" | "replace";

export type NavigationHref =
  | string
  | {
      pathname: string;
      params?: unknown;
      query?: unknown;
    };

function normalizeNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function normalizeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  switch (typeof value) {
    case "string":
      return `string:${JSON.stringify(value)}`;
    case "number":
      return `number:${normalizeNumber(value)}`;
    case "boolean":
      return `boolean:${value}`;
    case "bigint":
      return `bigint:${value}`;
    case "object": {
      if (Array.isArray(value)) {
        return `array:[${value.map(normalizeValue).join(",")}]`;
      }

      const entries = Object.entries(value as Record<string, unknown>).sort(
        ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
      );
      return `object:{${entries
        .map(
          ([key, entryValue]) =>
            `${JSON.stringify(key)}:${normalizeValue(entryValue)}`,
        )
        .join(",")}}`;
    }
    default:
      return `${typeof value}:${String(value)}`;
  }
}

export function normalizeHrefForDeduplication(href: unknown): string {
  if (typeof href === "string") {
    return `href:string:${JSON.stringify(href)}`;
  }

  if (href && typeof href === "object") {
    return `href:object:${normalizeValue(href)}`;
  }

  return `href:${normalizeValue(href)}`;
}

export function buildNavigationDedupeKey(
  action: NavigationAction,
  href: NavigationHref,
): string {
  return `${action}:${normalizeHrefForDeduplication(href)}`;
}

export function createNavigationDeduplicator(windowMs: number) {
  let lastNavigationTime = 0;
  let lastNavigationKey: string | null = null;

  return {
    shouldSuppress(
      action: NavigationAction,
      href: NavigationHref,
      now: number,
      bypass = false,
    ): boolean {
      const key = buildNavigationDedupeKey(action, href);
      if (
        !bypass &&
        now - lastNavigationTime < windowMs &&
        lastNavigationKey === key
      ) {
        return true;
      }

      lastNavigationTime = now;
      lastNavigationKey = key;
      return false;
    },
    reset(): void {
      lastNavigationTime = 0;
      lastNavigationKey = null;
    },
  };
}
