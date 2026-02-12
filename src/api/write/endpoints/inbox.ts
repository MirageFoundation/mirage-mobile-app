import { api } from "@/src/api/client";

export interface MarkInboxViewedResponse {
  ok: boolean;
  inbox_last_viewed_at: number;
}

export async function markInboxViewed(
  address: string
): Promise<MarkInboxViewedResponse> {
  return api.post<MarkInboxViewedResponse>("/mark_inbox_viewed", { address });
}
