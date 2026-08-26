import type { ReferralSummaryItem } from "@/src/api/types";

export type ReferralListEmptyState = "loading" | "error" | "empty" | null;

export type ReferralListFooter =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "summary"; visibleCount: number; total: number };

interface ReferralPaginationState {
  supportsPagination: boolean;
  hasMore: boolean;
  isFetchingNextPage: boolean;
}

interface CreateReferralListModelParams extends ReferralPaginationState {
  isLoading: boolean;
  isError: boolean;
  itemCount: number;
  total?: number;
}

export function getReferralRowKey(item: ReferralSummaryItem): string {
  return item.address;
}

export function shouldRequestReferralNextPage({
  supportsPagination,
  hasMore,
  isFetchingNextPage,
}: ReferralPaginationState): boolean {
  return supportsPagination && hasMore && !isFetchingNextPage;
}

export function createReferralListModel({
  isLoading,
  isError,
  itemCount,
  total,
  supportsPagination,
  hasMore,
  isFetchingNextPage,
}: CreateReferralListModelParams) {
  const emptyState: ReferralListEmptyState = itemCount > 0
    ? null
    : isLoading
      ? "loading"
      : isError
        ? "error"
        : "empty";
  const canRequestNextPage = shouldRequestReferralNextPage({
    supportsPagination,
    hasMore,
    isFetchingNextPage,
  });

  let footer: ReferralListFooter = { kind: "none" };
  if (itemCount > 0 && supportsPagination && isFetchingNextPage) {
    footer = { kind: "loading" };
  } else if (itemCount > 0 && hasMore && total !== undefined) {
    footer = { kind: "summary", visibleCount: itemCount, total };
  }

  return {
    header: { totalLabel: total === undefined ? null : `${total} total` },
    emptyState,
    footer,
    canRequestNextPage,
  };
}
