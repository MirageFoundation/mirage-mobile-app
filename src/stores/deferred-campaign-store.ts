import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CampaignParams } from "@/src/navigation/campaign-linking";
import { mmkvStorage } from "./mmkv-storage";

export const DEFERRED_CAMPAIGN_STORAGE_VERSION = 1;

export type DeferredCampaignSnapshot = CampaignParams & {
  capturedAt: number;
};

const CAMPAIGN_SNAPSHOT_FIELDS = [
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

type DeferredCampaignState = {
  pending: DeferredCampaignSnapshot | null;
  acknowledgedAt: number | null;
  captureFirstTouch: (fields: CampaignParams) => void;
  acknowledgeAttributionSuccess: (snapshot: DeferredCampaignSnapshot) => void;
};

function hasCampaignFields(fields: CampaignParams): boolean {
  return Object.values(fields).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export function isSameDeferredCampaignSnapshot(
  left: DeferredCampaignSnapshot,
  right: DeferredCampaignSnapshot,
): boolean {
  if (left.capturedAt !== right.capturedAt) return false;
  return CAMPAIGN_SNAPSHOT_FIELDS.every((key) => left[key] === right[key]);
}

export const useDeferredCampaignStore = create<DeferredCampaignState>()(
  persist(
    (set, get) => ({
      pending: null,
      acknowledgedAt: null,
      captureFirstTouch: (fields) => {
        if (get().pending) return;
        if (!hasCampaignFields(fields)) return;
        const snapshot: DeferredCampaignSnapshot = {
          ...fields,
          capturedAt: Date.now(),
        };
        set({ pending: snapshot, acknowledgedAt: null });
      },
      acknowledgeAttributionSuccess: (snapshot) => {
        const pending = get().pending;
        if (!pending || get().acknowledgedAt != null) return;
        if (!isSameDeferredCampaignSnapshot(pending, snapshot)) return;
        set({ acknowledgedAt: Date.now() });
      },
    }),
    {
      name: "deferred-campaign-storage",
      storage: createJSONStorage(() => mmkvStorage),
      version: DEFERRED_CAMPAIGN_STORAGE_VERSION,
      partialize: (state) => ({
        pending: state.pending,
        acknowledgedAt: state.acknowledgedAt,
      }),
    },
  ),
);
