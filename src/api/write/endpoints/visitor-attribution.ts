import { api } from "@/src/api/client";
import {
  getMiragePlatform,
  type MiragePlatform,
} from "@/src/api/mirage-request-headers";
import type { CampaignParams } from "@/src/navigation/campaign-linking";
import { getVisitorId } from "@/src/services/visitor-identity";

export const VISITOR_ATTRIBUTION_REF_MAX_LENGTH = 300;
export const VISITOR_ATTRIBUTION_UTM_MAX_LENGTH = 200;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type VisitorAttributionRequest = {
  visitor_id: string;
  platform: MiragePlatform;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

export type VisitorAttributionResponse = {
  ok?: unknown;
};

function boundOptional(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

export function buildVisitorAttributionBody(
  snapshot: CampaignParams,
  visitorId = getVisitorId(),
  platform = getMiragePlatform(),
): VisitorAttributionRequest | null {
  if (!visitorId || !platform) return null;

  const body: VisitorAttributionRequest = {
    visitor_id: visitorId,
    platform,
  };
  const ref = boundOptional(snapshot.ref, VISITOR_ATTRIBUTION_REF_MAX_LENGTH);
  if (ref) body.ref = ref;
  for (const key of UTM_KEYS) {
    const value = boundOptional(snapshot[key], VISITOR_ATTRIBUTION_UTM_MAX_LENGTH);
    if (value) body[key] = value;
  }
  return body;
}

export function isVisitorAttributionAccepted(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as VisitorAttributionResponse).ok === true
  );
}

export async function postVisitorAttribution(
  snapshot: CampaignParams,
): Promise<VisitorAttributionResponse> {
  const body = buildVisitorAttributionBody(snapshot);
  if (!body) {
    throw new Error("Visitor attribution identity unavailable");
  }
  return api.post<VisitorAttributionResponse, VisitorAttributionRequest>(
    "/stats/visitor_attribution",
    body,
  );
}
