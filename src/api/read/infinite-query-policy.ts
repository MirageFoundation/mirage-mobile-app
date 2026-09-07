export const FEED_MAX_PAGES = 8;
export const USER_POSTS_MAX_PAGES = 6;
export const INBOX_MAX_PAGES = 5;
export const COMMUNITIES_MAX_PAGES = 20;
export const CREATOR_EARNINGS_QUERY_MAX_PAGES = 40;

export const FEED_QUERY_GC_TIME = 1000 * 60 * 60 * 2;
export const USER_POSTS_QUERY_GC_TIME = 1000 * 60 * 60;
export const INBOX_QUERY_GC_TIME = 1000 * 60 * 30;
export const COMMUNITIES_QUERY_GC_TIME = 1000 * 60 * 60 * 24;
export const POST_DETAIL_QUERY_GC_TIME = 1000 * 60 * 30;

export function getPreviousNumberedPageParam(
  firstPage: { page?: number } | undefined,
): number | undefined {
  const page = Number(firstPage?.page);
  return Number.isFinite(page) && page > 1 ? page - 1 : undefined;
}
