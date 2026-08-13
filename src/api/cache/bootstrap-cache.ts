import type { QueryClient } from "@tanstack/react-query";

import type {
  BootstrapParams,
  BootstrapResponse,
} from "@/src/api/read/endpoints/bootstrap";
import { queryKeys } from "@/src/api/read/query-keys";
import type { PostsResponse } from "@/src/api/types";

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
  queryClient.setQueryData<{ pages: PostsResponse[]; pageParams: number[] }>(
    queryKeys.posts({ ...feedParams, page: undefined }),
    {
      pages: [response.view],
      pageParams: [1],
    },
  );
}
