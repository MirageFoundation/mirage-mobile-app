export const SEEN_TRACKER_MAX_EXPOSURES = 256;

export function shouldDropEndedExposure(glanceCount: number): boolean {
  return glanceCount <= 0;
}

export function needsSeenExposurePrune(size: number, max = SEEN_TRACKER_MAX_EXPOSURES): boolean {
  return size > max;
}
