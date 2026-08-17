export const COLLAPSED_FRACTION = 0.3;
export const HEADER_HEIGHT_BASE = 48;
export const INPUT_DOCK_HEIGHT = 52;
export const INITIAL_SUMMARY_MIN_HEIGHT = 132;
export const INITIAL_SUMMARY_MAX_FRACTION = 0.55;

export type MediaPostDetailInsets = {
  top: number;
  bottom: number;
};

export type MediaPostDetailLayoutMetrics = {
  collapseDistance: number;
  collapsedMediaH: number;
  collapsedMediaTop: number;
  expandedMediaH: number;
  expandedMediaTop: number;
  headerH: number;
  inputDockTotalH: number;
  listTopY: number;
  peekH: number;
};

export function getMediaPostDetailLayoutMetrics({
  insets,
  measuredInputDockH,
  measuredPostSummaryH,
  screenH,
}: {
  insets: MediaPostDetailInsets;
  measuredInputDockH?: number;
  measuredPostSummaryH?: number;
  screenH: number;
}): MediaPostDetailLayoutMetrics {
  const headerH = insets.top + HEADER_HEIGHT_BASE;
  const inputDockTotalH = measuredInputDockH ?? INPUT_DOCK_HEIGHT + insets.bottom;
  const collapsedMediaTop = insets.top;
  const collapsedMediaH = Math.round(screenH * COLLAPSED_FRACTION);
  const listTopY = collapsedMediaTop + collapsedMediaH;
  const expandedMediaTop = headerH;
  const peekH = Math.min(
    Math.max(measuredPostSummaryH || 0, INITIAL_SUMMARY_MIN_HEIGHT),
    Math.min(Math.max(0, screenH - listTopY - 24), screenH * INITIAL_SUMMARY_MAX_FRACTION),
  );
  const expandedMediaBottom = screenH - peekH;
  const expandedMediaH = Math.max(collapsedMediaH, expandedMediaBottom - expandedMediaTop);
  const collapseDistance = Math.max(0, expandedMediaBottom - listTopY);

  return {
    collapseDistance,
    collapsedMediaH,
    collapsedMediaTop,
    expandedMediaH,
    expandedMediaTop,
    headerH,
    inputDockTotalH,
    listTopY,
    peekH,
  };
}
