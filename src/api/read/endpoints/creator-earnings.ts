import { api } from "../../client";
import {
  CREATOR_EARNINGS_MAX_PAGES,
  CREATOR_EARNINGS_SETTLE_PAGE_LIMIT,
  createEarningsPageGuard,
  emptyCreatorEarningTargetsResponse,
  normalizeCreatorEarningTargetsRequest,
  normalizeCreatorEarningsRequest,
  parseCreatorEarningTargetsResponse,
  parseCreatorEarningsResponse,
  toCreatorEarningsQueryParams,
  type CreatorEarningsRequestInput,
  type CreatorEarningsResponse,
  type CreatorEarningTargetsRequestInput,
  type CreatorEarningTargetsResponse,
} from "@/src/domain/creator-earnings";

export async function getCreatorEarnings(
  params: CreatorEarningsRequestInput,
  options?: { signal?: AbortSignal },
): Promise<CreatorEarningsResponse> {
  const request = normalizeCreatorEarningsRequest(params);
  const response = await api.get<unknown>(
    "/creator/earnings",
    toCreatorEarningsQueryParams(request),
    options,
  );
  return parseCreatorEarningsResponse(response);
}

export async function getCreatorEarningTargets(
  params: CreatorEarningTargetsRequestInput,
  options?: { signal?: AbortSignal },
): Promise<CreatorEarningTargetsResponse> {
  const request = normalizeCreatorEarningTargetsRequest(params);
  if (!request) return emptyCreatorEarningTargetsResponse();
  const response = await api.get<unknown>(
    `/creator/earnings/${request.epoch_id}/targets`,
    {
      creator: request.creator,
      limit: request.limit,
      ...(request.cursor ? { cursor: request.cursor } : {}),
    },
    options,
  );
  return parseCreatorEarningTargetsResponse(response);
}

export async function fetchCreatorEarningsPages(
  params: CreatorEarningsRequestInput & {
    stopEpochIds?: readonly number[];
    maxPages?: number;
  },
  options?: { signal?: AbortSignal },
): Promise<CreatorEarningsResponse> {
  const request = normalizeCreatorEarningsRequest({
    ...params,
    cursor: undefined,
  });
  const wanted = new Set((params.stopEpochIds ?? []).map(Number));
  const found = new Set<number>();
  const items: CreatorEarningsResponse["items"] = [];
  const guard = createEarningsPageGuard();
  let cursor: string | null = null;
  const maxPages = params.maxPages ?? CREATOR_EARNINGS_MAX_PAGES;
  let lastPage: CreatorEarningsResponse | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const next = guard.accept(
      await getCreatorEarnings(
        {
          ...request,
          limit: request.limit || CREATOR_EARNINGS_SETTLE_PAGE_LIMIT,
          cursor,
        },
        options,
      ),
    );
    lastPage = next;
    items.push(...next.items);
    for (const item of next.items) {
      if (wanted.has(item.epoch_id)) found.add(item.epoch_id);
    }
    if (wanted.size > 0 && found.size === wanted.size) break;
    if (!next.has_more) break;
    cursor = next.next_cursor;
    if (page === maxPages - 1) {
      throw new Error("Creator earnings exceeded the pagination budget");
    }
  }

  return {
    items,
    creator_epoch_seconds: lastPage?.creator_epoch_seconds ?? null,
    origin_epoch: lastPage?.origin_epoch ?? null,
    origin_unix: lastPage?.origin_unix ?? null,
    max_creator_claim_epochs: lastPage?.max_creator_claim_epochs ?? null,
    next_cursor: lastPage?.next_cursor ?? null,
    has_more: lastPage?.has_more ?? false,
  };
}
