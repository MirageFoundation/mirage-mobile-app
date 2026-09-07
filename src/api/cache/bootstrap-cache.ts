import type { QueryClient } from "@tanstack/react-query";

import type {
  BootstrapParams,
  BootstrapResponse,
} from "@/src/api/read/endpoints/bootstrap";
import { normalizeLensIdentity } from "@/src/api/read/request-params";
import { normalizeAccountIdentity, queryKeys } from "@/src/api/read/query-keys";
import type { PostsResponse } from "@/src/api/types";
import type { LensMode } from "@/src/domain/communities";
import { getServerIdentity, normalizeServerBaseUrl } from "@/src/api/server-runtime";

type BootstrapFeedPreviewKey = {
  serverIdentity?: string;
  feed?: string;
  by?: string;
  community?: string;
  allowed_tags?: string;
  address?: string;
  lens?: LensMode;
  team_id?: number | null;
  scope?: "current" | "legacy";
  lens_picks?: string;
};

const bootstrapFeedPreviews = new Map<string, { page: PostsResponse; expiresAt: number }>();
const PREVIEW_TTL = 60_000;
const MAX_PREVIEWS = 20;

function previewStorageKey({
  serverIdentity = getServerIdentity(),
  feed,
  by,
  community,
  allowed_tags,
  address,
  lens,
  team_id,
  scope,
  lens_picks,
}: BootstrapFeedPreviewKey): string {
  const identity = normalizeLensIdentity(
    { lens, team_id, scope, lens_picks },
    { community },
  );
  return JSON.stringify({
    server: normalizeServerBaseUrl(serverIdentity),
    feed: feed ?? null,
    by: by ?? "magic",
    community: community ?? null,
    allowed_tags: allowed_tags ?? null,
    address: normalizeAccountIdentity(address),
    lens: identity.lens,
    team_id: identity.team_id,
    scope: identity.scope,
    lens_picks: identity.lens_picks,
  });
}

export function rememberBootstrapFeedPreview(
  key: BootstrapFeedPreviewKey,
  page: PostsResponse,
): void {
  for (const [storedKey, entry] of bootstrapFeedPreviews) {
    if (entry.expiresAt <= Date.now()) bootstrapFeedPreviews.delete(storedKey);
  }
  const storageKey = previewStorageKey(key);
  bootstrapFeedPreviews.delete(storageKey);
  bootstrapFeedPreviews.set(storageKey, { page, expiresAt: Date.now() + PREVIEW_TTL });
  while (bootstrapFeedPreviews.size > MAX_PREVIEWS) {
    bootstrapFeedPreviews.delete(bootstrapFeedPreviews.keys().next().value!);
  }
}

export function consumeBootstrapFeedPreview(
  key: BootstrapFeedPreviewKey,
): PostsResponse | null {
  const storageKey = previewStorageKey(key);
  const entry = bootstrapFeedPreviews.get(storageKey);
  bootstrapFeedPreviews.delete(storageKey);
  return entry && entry.expiresAt > Date.now() ? entry.page : null;
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
    ...(response.view.community ? { community: response.view.community } : {}),
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
      community: feedParams.community,
      allowed_tags: feedParams.allowed_tags,
      address: feedParams.address,
      lens: feedParams.lens,
      team_id: feedParams.team_id,
      scope: feedParams.scope,
      lens_picks: feedParams.lens_picks,
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
