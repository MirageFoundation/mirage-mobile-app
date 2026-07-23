/**
 * Dev-only time-to-first-frame (TTFF) measurement for native video.
 *
 * Marks when a source is handed to a player (prepare start) and logs the
 * elapsed time when the first frame renders. No-ops entirely in production.
 */
const prepareStartTimes = new Map<string, number>();

export function markVideoPrepareStart(uri: string): void {
  if (!__DEV__) return;
  if (!prepareStartTimes.has(uri)) prepareStartTimes.set(uri, Date.now());
}

export function clearVideoPrepareMark(uri: string): void {
  if (!__DEV__) return;
  prepareStartTimes.delete(uri);
}

export function markVideoFirstFrame(uri: string, context: string): void {
  if (!__DEV__) return;
  const startedAt = prepareStartTimes.get(uri);
  if (startedAt === undefined) return;
  prepareStartTimes.delete(uri);
  console.log(`[VideoTTFF] ${context} first frame in ${Date.now() - startedAt}ms`, {
    uri: uri.split("?")[0].slice(-60),
  });
}
