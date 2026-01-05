import { api } from "../../client";
import type { InboxResponse } from "../../types";

export interface GetInboxParams {
  address: string; // Required
  page?: number;
  limit?: number; // max 100
}

/**
 * Get user's reply notifications
 */
export async function getInbox(
  params: GetInboxParams
): Promise<InboxResponse> {
  return api.get<InboxResponse>("/get_inbox", params);
}
