export type FeedViewToken<T> = {
  item?: T | null;
  index?: number | null;
  isViewable?: boolean;
  key?: string;
};

type Identifiable = { id?: string };

export function mergeViewableTokens<T extends Identifiable>(
  previous: ReadonlyMap<string, FeedViewToken<T>>,
  viewableItems: readonly FeedViewToken<T>[],
  changed?: readonly FeedViewToken<T>[],
): Map<string, FeedViewToken<T>> {
  if (!changed?.length) {
    const snapshot = new Map<string, FeedViewToken<T>>();
    for (const token of viewableItems) {
      const id = token.item?.id;
      if (id && token.isViewable) snapshot.set(id, token);
    }
    return snapshot;
  }

  const next = new Map(previous);
  for (const token of changed) {
    const id = token.item?.id;
    if (!id) continue;
    if (token.isViewable) {
      next.set(id, token);
    } else {
      next.delete(id);
    }
  }
  return next;
}

export type BoundedIndexRange = {
  start: number;
  end: number;
  count: number;
};

type ItemLayout = { y: number; height: number };

type FeedListViewportState = {
  scroll: number;
  scrollLength: number;
  positionAtIndex: (index: number) => number;
  sizeAtIndex: (index: number) => number;
};

export type FeedListViewport = {
  viewportHeight: number;
  scrollOffset: number;
  getLayout: (index: number) => ItemLayout | undefined;
};

export function getFeedListViewport(list: {
  getState: () => FeedListViewportState;
}): FeedListViewport | null {
  try {
    const state = list.getState();
    if (!state.scrollLength) return null;
    return {
      viewportHeight: state.scrollLength,
      scrollOffset: state.scroll,
      getLayout: (index) => {
        const height = state.sizeAtIndex(index);
        if (!Number.isFinite(height) || height <= 0) return undefined;
        const y = state.positionAtIndex(index);
        if (!Number.isFinite(y)) return undefined;
        return { y, height };
      },
    };
  } catch {
    return null;
  }
}

type BoundedIndexRangeOptions = {
  itemCount: number;
  scrollOffset: number;
  viewportHeight: number;
  estimatedItemSize: number;
  anchorIndices?: readonly number[];
  overscan?: number;
  maxCandidates?: number;
};

export function getBoundedVisibleIndexRange({
  itemCount,
  scrollOffset,
  viewportHeight,
  estimatedItemSize,
  anchorIndices = [],
  overscan = 3,
  maxCandidates = 24,
}: BoundedIndexRangeOptions): BoundedIndexRange | null {
  if (itemCount <= 0 || viewportHeight <= 0 || estimatedItemSize <= 0) return null;

  const candidateLimit = Math.max(1, Math.min(itemCount, Math.floor(maxCandidates)));
  const validAnchors = anchorIndices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < itemCount,
  );
  const estimatedStart = Math.max(0, Math.floor(Math.max(0, scrollOffset) / estimatedItemSize));
  const estimatedVisibleCount = Math.max(1, Math.ceil(viewportHeight / estimatedItemSize));

  let desiredStart: number;
  let desiredEnd: number;
  if (validAnchors.length > 0) {
    desiredStart = Math.min(...validAnchors) - overscan;
    desiredEnd = Math.max(...validAnchors) + overscan;
  } else {
    desiredStart = estimatedStart - overscan;
    desiredEnd = estimatedStart + estimatedVisibleCount - 1 + overscan;
  }

  desiredStart = Math.max(0, desiredStart);
  desiredEnd = Math.min(itemCount - 1, desiredEnd);
  if (desiredEnd - desiredStart + 1 > candidateLimit) {
    const center = validAnchors.length > 0
      ? Math.round((Math.min(...validAnchors) + Math.max(...validAnchors)) / 2)
      : estimatedStart + Math.floor((estimatedVisibleCount - 1) / 2);
    desiredStart = Math.max(0, center - Math.floor(candidateLimit / 2));
    desiredEnd = Math.min(itemCount - 1, desiredStart + candidateLimit - 1);
    desiredStart = Math.max(0, desiredEnd - candidateLimit + 1);
  }

  return {
    start: desiredStart,
    end: desiredEnd,
    count: desiredEnd - desiredStart + 1,
  };
}

type VisibleLayoutOptions = {
  range: BoundedIndexRange;
  scrollOffset: number;
  viewportHeight: number;
  minimumVisibleRatio: number;
  getLayout: (index: number) => ItemLayout | undefined;
};

export function getVisibleLayoutIndices({
  range,
  scrollOffset,
  viewportHeight,
  minimumVisibleRatio,
  getLayout,
}: VisibleLayoutOptions): number[] {
  const visibleIndices: number[] = [];
  for (let index = range.start; index <= range.end; index++) {
    const layout = getLayout(index);
    if (!layout || layout.height <= 0) continue;
    const itemTop = layout.y - scrollOffset;
    const itemBottom = itemTop + layout.height;
    const overlap = Math.max(
      0,
      Math.min(viewportHeight, itemBottom) - Math.max(0, itemTop),
    );
    if (overlap / layout.height >= minimumVisibleRatio) {
      visibleIndices.push(index);
    }
  }
  return visibleIndices;
}
