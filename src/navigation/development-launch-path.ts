import { isMirageScheme } from "./route-map";

/** Strip Expo transport only at the native development launch boundary. */
export function normalizeDevelopmentLaunchPath(path: string): string {
  try {
    const url = new URL(path);
    if (
      url.hostname === "expo-development-client" &&
      (url.protocol === "exp+mirage:" || isMirageScheme(url.protocol.slice(0, -1))) &&
      (url.pathname === "" || url.pathname === "/")
    ) {
      const bundleUrl = url.searchParams.get("url");
      if (!bundleUrl) return path;
      const transport = new URL(bundleUrl);
      if (!["http:", "https:", "exp:", "exps:"].includes(transport.protocol)) return path;
      return transportPath(transport) ?? path;
    }
    if (url.protocol === "exp:" || url.protocol === "exps:") {
      return transportPath(url) ?? path;
    }
  } catch {
    // Ordinary app paths are resolved by the canonical route map.
  }
  return path;
}

function transportPath(url: URL): string | null {
  if (url.pathname === "" || url.pathname === "/" || url.pathname === "/--") return "/";
  if (url.pathname.startsWith("/--/")) {
    return `${url.pathname.slice(3)}${url.search}`;
  }
  return null;
}
