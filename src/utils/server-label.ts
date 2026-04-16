/**
 * Format an API server URL for display in the UI.
 * Strips the scheme (https/http) and shows "· HTTP" suffix for unencrypted nodes.
 *
 * Examples:
 *   "https://mirage.talk"  -> "mirage.talk"
 *   "http://1.2.3.4"       -> "1.2.3.4 · HTTP"
 *   "http://1.2.3.4:8080"  -> "1.2.3.4:8080 · HTTP"
 *   "mirage.talk"          -> "mirage.talk"  (defensive, in case of bare host)
 */
export function formatServerLabel(server: string): string {
  if (!server) return server;
  try {
    const u = new URL(
      /^https?:\/\//i.test(server) ? server : `https://${server}`
    );
    const isHttp = u.protocol === "http:";
    return isHttp ? `${u.host} · HTTP` : u.host;
  } catch {
    return server;
  }
}
