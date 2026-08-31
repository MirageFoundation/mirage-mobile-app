import type { QueryClient } from "@tanstack/react-query";

import type {
  BootstrapParams,
  BootstrapResponse,
} from "@/src/api/read/endpoints/bootstrap";
import { normalizeAccountIdentity, queryKeys } from "@/src/api/read/query-keys";
import type { PostsResponse } from "@/src/api/types";

type BootstrapFeedPreviewKey = {
  feed?: string;
  by?: string;
  topic?: string;
  allowed_tags?: string;
  address?: string;
};

const bootstrapFeedPreviews = new Map<string, PostsResponse>();

function previewStorageKey({
  feed,
  by,
  topic,
  allowed_tags,
  address,
}: BootstrapFeedPreviewKey): string {
  return JSON.stringify({
    feed: feed ?? null,
    by: by ?? "magic",
    topic: topic ?? null,
    allowed_tags: allowed_tags ?? null,
    address: normalizeAccountIdentity(address),
  });
}

export function rememberBootstrapFeedPreview(
  key: BootstrapFeedPreviewKey,
  page: PostsResponse,
): void {
  bootstrapFeedPreviews.set(previewStorageKey(key), page);
}

export function consumeBootstrapFeedPreview(
  key: BootstrapFeedPreviewKey,
): PostsResponse | null {
  const storageKey = previewStorageKey(key);
  const page = bootstrapFeedPreviews.get(storageKey) ?? null;
  if (page) bootstrapFeedPreviews.delete(storageKey);
  return page;
}

export function hydrateBootstrapViewCache(
  queryClient: QueryClient,
  response: BootstrapResponse,
  params: BootstrapParams,
): void {
  if (response.view?.kind !== "feed") return;

  const { view: _view, ...requestParams } = params;
  const feedParams = {
    ...requestParams,
    ...(response.view.feed ? { feed: response.view.feed } : {}),
    ...(response.view.topic ? { topic: response.view.topic } : {}),
  };
  const queryKey = queryKeys.posts({ ...feedParams, page: undefined });
  const existing = queryClient.getQueryData<{
    pages: PostsResponse[];
    pageParams: unknown[];
  }>(queryKey);

  if (existing?.pages?.some((page) => page.posts.length > 0)) {
    // A persisted feed is already on screen. Replacing it with bootstrap's
    // first page jumps the user to new posts. Keep the cached list and let
    // the new-posts pill consume this preview instead.
    rememberBootstrapFeedPreview({
      feed: feedParams.feed,
      by: feedParams.by,
      topic: feedParams.topic,
      allowed_tags: feedParams.allowed_tags,
      address: feedParams.address,
    }, response.view);
    return;
  }

  queryClient.setQueryData<{ pages: PostsResponse[]; pageParams: number[] }>(
    queryKey,
    {
      pages: [response.view],
      pageParams: [1],
    },
  );
}
