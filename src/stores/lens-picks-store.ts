import { create } from "zustand";

import {
  LENS_PICKS_MAX,
  encodeLensPicks,
  isValidCommunitySlug,
  normalizeLensSelection,
  type LensPick,
} from "@/src/domain/communities";

export type SessionLensPick = LensPick & {
  selected_at: number;
};

type LensPicksState = {
  picksByViewer: Record<string, SessionLensPick[]>;
  setPick: (input: {
    viewer?: string | null;
    community: string;
    lens: LensPick["lens"];
    team_id?: number | null;
    now?: number;
  }) => void;
  clearPick: (viewer: string | null | undefined, community: string) => void;
  clearPickOnJoinSuccess: (viewer: string | null | undefined, community: string) => void;
  clearViewer: (viewer?: string | null) => void;
  clearAll: () => void;
};

function normalizeViewer(viewer?: string | null): string {
  return viewer?.trim().toLowerCase() || "anonymous";
}

function normalizePickCommunity(community: string): string {
  const slug = String(community ?? "").trim().toLowerCase();
  if (!isValidCommunitySlug(slug)) {
    throw new Error("invalid lens pick community");
  }
  return slug;
}

function sortPicks(picks: SessionLensPick[]): SessionLensPick[] {
  return [...picks].sort((left, right) => (
    right.selected_at - left.selected_at
    || left.community.localeCompare(right.community)
  ));
}

function retainNewestPicks(picks: SessionLensPick[]): SessionLensPick[] {
  return sortPicks(picks).slice(0, LENS_PICKS_MAX);
}

function encodeViewerPicks(picks: SessionLensPick[] | undefined): string {
  if (!picks || picks.length === 0) return "";
  return encodeLensPicks(retainNewestPicks(picks).map(({ community, lens, team_id }) => ({
    community,
    lens,
    team_id,
  })));
}

export const useLensPicksStore = create<LensPicksState>((set) => ({
  picksByViewer: {},

  setPick: ({ viewer, community, lens, team_id = null, now = Date.now() }) => {
    const viewerKey = normalizeViewer(viewer);
    const slug = normalizePickCommunity(community);
    const normalized = normalizeLensSelection(
      { lens, team_id, scope: "current" },
      { community: slug },
    );
    if (normalized.lens === "effective") {
      throw new Error("invalid lens_picks");
    }
    const pick: SessionLensPick = {
      community: slug,
      lens: normalized.lens,
      team_id: normalized.team_id,
      selected_at: 0,
    };

    set((state) => {
      const existing = state.picksByViewer[viewerKey] ?? [];
      const newest = existing.reduce((max, entry) => Math.max(max, entry.selected_at), 0);
      pick.selected_at = Math.max(now, newest + 1);
      const next = retainNewestPicks([
        pick,
        ...existing.filter((entry) => entry.community !== slug),
      ]);
      return {
        picksByViewer: {
          ...state.picksByViewer,
          [viewerKey]: next,
        },
      };
    });
  },

  clearPick: (viewer, community) => {
    const viewerKey = normalizeViewer(viewer);
    const slug = String(community ?? "").trim().toLowerCase();
    set((state) => {
      const existing = state.picksByViewer[viewerKey];
      if (!existing) return state;
      const next = existing.filter((entry) => entry.community !== slug);
      if (next.length === existing.length) return state;
      if (next.length === 0) {
        const { [viewerKey]: _removed, ...rest } = state.picksByViewer;
        return { picksByViewer: rest };
      }
      return {
        picksByViewer: {
          ...state.picksByViewer,
          [viewerKey]: next,
        },
      };
    });
  },

  clearPickOnJoinSuccess: (viewer, community) => {
    useLensPicksStore.getState().clearPick(viewer, community);
  },

  clearViewer: (viewer) => {
    const viewerKey = normalizeViewer(viewer);
    set((state) => {
      if (!(viewerKey in state.picksByViewer)) return state;
      const { [viewerKey]: _removed, ...rest } = state.picksByViewer;
      return { picksByViewer: rest };
    });
  },

  clearAll: () => set({ picksByViewer: {} }),
}));

export function getSessionLensPick(
  viewer: string | null | undefined,
  community: string,
): SessionLensPick | undefined {
  const viewerKey = normalizeViewer(viewer);
  const slug = String(community ?? "").trim().toLowerCase();
  return useLensPicksStore.getState().picksByViewer[viewerKey]?.find(
    (entry) => entry.community === slug,
  );
}

export function getEncodedLensPicks(viewer?: string | null): string {
  const viewerKey = normalizeViewer(viewer);
  return encodeViewerPicks(useLensPicksStore.getState().picksByViewer[viewerKey]);
}

export function useEncodedLensPicks(viewer?: string | null): string {
  const viewerKey = normalizeViewer(viewer);
  return useLensPicksStore((state) => encodeViewerPicks(state.picksByViewer[viewerKey]));
}

export const clearLensPick = (
  viewer: string | null | undefined,
  community: string,
): void => useLensPicksStore.getState().clearPick(viewer, community);

export const clearLensPickOnJoinSuccess = (
  viewer: string | null | undefined,
  community: string,
): void => useLensPicksStore.getState().clearPickOnJoinSuccess(viewer, community);

export const clearViewerLensPicks = (viewer?: string | null): void =>
  useLensPicksStore.getState().clearViewer(viewer);

export const clearAllLensPicks = (): void =>
  useLensPicksStore.getState().clearAll();
