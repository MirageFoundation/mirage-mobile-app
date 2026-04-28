import { api } from "../../client";
import type { InboxResponse } from "../../types";

export interface GetInboxParams {
  address?: string; // Required by API; optional here so logged-out callers can be guarded
  page?: number;
  limit?: number; // max 100
}

/**
 * Get user's reply notifications
 */
export async function getInbox(
  params: GetInboxParams
): Promise<InboxResponse> {
  const address = params.address?.trim();
  if (!address) {
    return {
      replies: [],
      total: 0,
      page: params.page ?? 1,
      limit: params.limit ?? 25,
      has_more: false,
    };
  }

  const safeParams = { ...params, address };
  return api.get<InboxResponse>("/get_inbox", safeParams);
}
