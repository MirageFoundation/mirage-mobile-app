import * as Sentry from "@sentry/react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";
import { setAnalyticsTrackingEnabled } from "@/src/services/analytics";
import {
  HAS_SEEN_ADULT_PROMPT_DEFAULT,
} from "@/src/services/home-entry-prompt-orchestrator";
import { CONTENT_WARNING_IDS, type ContentWarningId } from "@/src/domain/content";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";
export type FeedDensity = "card" | "compact";
export type ThemeMode = "light" | "dark" | "system";
export type ShareServer = string;
export type ApiServer = string;
export type VideoAutoplayNetwork = "always" | "wifi_only" | "never";
export type ContentType = ContentWarningId | "none" | "all";

const CONTENT_TAGS = CONTENT_WARNING_IDS;
const ADULT_CONTENT_TAGS = ["adult", "violence", "gore", "death"] as const;

type AdultContentTag = (typeof ADULT_CONTENT_TAGS)[number];

const normalizeContentTypes = (types: ContentType[]): ContentType[] => {
  if (!types || types.length === 0) return [];
 if (types.includes("all")) return ["all"];
  if (types.includes("none")) return [];

 const unique = Array.from(new Set(types));
 const filtered = unique.filter((type) => type !== "all" && type !== "none");

  return filtered.length === 0 ? [] : filtered;
};

export const getAllowedTagsFromContentTypes = (
  types: ContentType[],
  adultToggleEnabled?: boolean
): string => {
 const normalized = normalizeContentTypes(types);
 if (normalized.includes("all")) {
   if (adultToggleEnabled === false) {
     return CONTENT_TAGS.filter((tag) => tag !== "adult").join(",");
   }
   return CONTENT_TAGS.join(",");
 }
  if (normalized.length === 0) return "";

 const selected = new Set(normalized);
  if (!adultToggleEnabled) selected.delete("adult" as any);
  return CONTENT_TAGS.filter((tag) => selected.has(tag)).join(",");
};

export const isAdultContentEnabled = (types: ContentType[]): boolean => {
  if (!types || types.length === 0) return false;
  if (types.includes("all")) return true;
  return types.some((type) =>
    ADULT_CONTENT_TAGS.includes(type as AdultContentTag)
  );
};

export const getShareBaseUrl = (server: ShareServer): string => {
  return `https://${server}`;
};

export const getApiBaseUrl = (server: ApiServer): string => {
  return `https://${server}`;
};

type PreferencesState = {
  // Feed
  feedType: FeedType;
  followingFeedType: FeedType;
  feedDensity: FeedDensity;

  // Theme
  theme: ThemeMode;

  // Content
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  adultPromptDismissedAt: number;
  selectedContentTypes: ContentType[];
  blurSensitiveMedia: boolean;
  ageVerified: boolean;
  hideDownvotedPosts: boolean;

  // Analytics (opt-in; EU consent requirement)
  analyticsConsent: boolean;
  analyticsConsentAsked: boolean;

  // Comments
  autoCollapseThreshold: number | null; // -10, -5, -3, -1, 0, or null (never)

  // Sidebar
  communitiesBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)
  peopleBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)

  // Sharing
  shareServer: ShareServer;

  // API Server
  apiServer: ApiServer;

 // Video
 autoPlayVideos: boolean;
 videoAutoplayNetwork: VideoAutoplayNetwork;

// Actions
 setFeedType: (type: FeedType) => void;
  setFollowingFeedType: (type: FeedType) => void;
  setFeedDensity: (density: FeedDensity) => void;
  setTheme: (theme: ThemeMode) => void;
  setAdultContent: (enabled: boolean) => void;
  answerAdultPrompt: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setAdultPromptDismissedAt: (timestamp: number) => void;
  setSelectedContentTypes: (types: ContentType[]) => void;
  toggleContentType: (type: ContentType) => void;
  setBlurSensitiveMedia: (blur: boolean) => void;
  setAgeVerified: (verified: boolean) => void;
  setHideDownvotedPosts: (hide: boolean) => void;
  setAnalyticsConsent: (granted: boolean) => void;
  setAutoCollapseThreshold: (threshold: number | null) => void;
  setCommunitiesBeforeShowMore: (count: number) => void;
  setPeopleBeforeShowMore: (count: number) => void;
  setShareServer: (server: ShareServer) => void;
  setApiServer: (server: ApiServer) => void;
 setAutoPlayVideos: (autoPlay: boolean) => void;
 setVideoAutoplayNetwork: (network: VideoAutoplayNetwork) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      // Feed
      feedType: "home",
      followingFeedType: "home",
      feedDensity: "card",

      // Theme
      theme: "system",

      // Content
      adultContentEnabled: false,
      hasSeenAdultPrompt: HAS_SEEN_ADULT_PROMPT_DEFAULT,
      adultPromptDismissedAt: 0,
      selectedContentTypes: ["sensitive"],
      blurSensitiveMedia: false,
      ageVerified: false,
      hideDownvotedPosts: false,

      // Analytics
      analyticsConsent: false,
      analyticsConsentAsked: false,

      // Comments
      autoCollapseThreshold: -5,

      // Sidebar
      communitiesBeforeShowMore: 5,
      peopleBeforeShowMore: 5,

      // Sharing
      shareServer: "mirage.talk",

      // API Server
      apiServer: "mirage.talk",

     // Video
     autoPlayVideos: true,
     videoAutoplayNetwork: "always",

    // Actions
     setFeedType: (type) => set({ feedType: type }),
      setFollowingFeedType: (type) => set({ followingFeedType: type }),
      setFeedDensity: (density) => set({ feedDensity: density }),
      setTheme: (theme) => set({ theme }),
      answerAdultPrompt: (enabled) => {
        if (get().hasSeenAdultPrompt) return;
        set((state) => ({
          adultContentEnabled: enabled,
          selectedContentTypes: enabled
            ? [...CONTENT_TAGS]
            : state.selectedContentTypes.filter(
                (type) => type !== "adult" && type !== "all" && type !== "none",
              ),
          hasSeenAdultPrompt: true,
          adultPromptDismissedAt: Date.now(),
        }));
      },
      setAdultContent: (enabled) =>
        set((state) => {
          if (enabled) {
            return {
              adultContentEnabled: true,
              selectedContentTypes: [...CONTENT_TAGS] as ContentType[],
            };
          }

          const kept = state.selectedContentTypes.filter(
            (type) => type !== "adult" && type !== "all" && type !== "none"
          );

          return {
            adultContentEnabled: false,
            selectedContentTypes: kept.length ? kept : kept,
          };
        }),
      setHasSeenAdultPrompt: () => set({ hasSeenAdultPrompt: true }),
      setAdultPromptDismissedAt: (timestamp) =>
        set({ adultPromptDismissedAt: timestamp }),
      setSelectedContentTypes: (types) => {
        const normalized = normalizeContentTypes(types);
        set({
          selectedContentTypes: normalized,
        });
      },
     toggleContentType: (type) =>
       set((state) => {
         if (type === "all") {
           return {
             selectedContentTypes: [...CONTENT_TAGS] as ContentType[],
           };
         }
        if (type === "none") {
          return {
             selectedContentTypes: [],
          };
        }

          let newTypes: ContentType[];
          newTypes = state.selectedContentTypes.filter(
            (t) => t !== "all" && t !== "none"
          );
          if (newTypes.includes(type)) {
            newTypes = newTypes.filter((t) => t !== type);
          } else {
            newTypes = [...newTypes, type];
          }

          return {
            selectedContentTypes: newTypes,
          };
        }),
      setBlurSensitiveMedia: (blur) => set({ blurSensitiveMedia: blur }),
      setAgeVerified: (verified) => set({ ageVerified: verified }),
      setHideDownvotedPosts: (hide) => set({ hideDownvotedPosts: hide }),
      setAnalyticsConsent: (granted) => {
        void setAnalyticsTrackingEnabled(granted);
        set({ analyticsConsent: granted, analyticsConsentAsked: true });
      },
      setAutoCollapseThreshold: (threshold) =>
        set({ autoCollapseThreshold: threshold }),
      setCommunitiesBeforeShowMore: (count) => set({ communitiesBeforeShowMore: count }),
      setPeopleBeforeShowMore: (count) => set({ peopleBeforeShowMore: count }),
      setShareServer: (server) => set({ shareServer: server }),
     setApiServer: (server) => set({ apiServer: server }),
     setAutoPlayVideos: (autoPlay) => set({ autoPlayVideos: autoPlay }),
     setVideoAutoplayNetwork: (network) => set({ videoAutoplayNetwork: network }),
  }),
   {
     name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
      version: 11,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<PreferencesState>;
        
        if (version === 0) {
          state.theme = "system";
        }

        if (version < 2) {
          if (state.apiServer === "mirage.vote") {
            state.apiServer = "mirage.talk";
          }
          if (state.shareServer === "mirage.vote") {
            state.shareServer = "mirage.talk";
          }
        }

        if (version < 3) {
          state.selectedContentTypes = ["sensitive"];
          state.adultContentEnabled = false;
          state.blurSensitiveMedia = false;
          // Historical installs lacked this field. Leave them marked as
          // already prompted so existing users are not reset.
          state.hasSeenAdultPrompt = true;
          state.adultPromptDismissedAt = 0;
        }

        if (version < 4) {
          if (state.selectedContentTypes) {
            state.selectedContentTypes = state.selectedContentTypes.map(
              (t) => (t === ("porn" as ContentType) ? "adult" : t)
            );
          }
        }

        if (version < 5) {
          state.adultPromptDismissedAt = state.adultPromptDismissedAt ?? 0;
          const legacyReminder = state as Record<string, unknown>;
          legacyReminder.moderationReminderUnderstoodByUser =
            legacyReminder.moderationReminderUnderstoodByUser ?? {};
          legacyReminder.moderationReminderSnoozedUntilByUser =
            legacyReminder.moderationReminderSnoozedUntilByUser ?? {};
        }

        if (version < 6) {
          state.analyticsConsent = false;
          state.analyticsConsentAsked = false;
        }

        if (version < 7) {
          state.feedDensity = state.feedDensity ?? "card";
          Sentry.addBreadcrumb({
            category: "preferences",
            message: "Migrated preferences to v7 (feedDensity)",
            level: "info",
            data: { from: version, to: 7 },
          });
        }

        if (version < 8) {
          const lowerKeys = <T,>(map?: Record<string, T>): Record<string, T> => {
            const out: Record<string, T> = {};
            for (const [key, value] of Object.entries(map ?? {})) {
              out[key.trim().toLowerCase()] = value;
            }
            return out;
          };
          (state as Record<string, unknown>).moderationReminderUnderstoodByUser = lowerKeys(
            (state as { moderationReminderUnderstoodByUser?: Record<string, boolean> })
              .moderationReminderUnderstoodByUser,
          );
          (state as Record<string, unknown>).moderationReminderSnoozedUntilByUser = lowerKeys(
            (state as { moderationReminderSnoozedUntilByUser?: Record<string, number> })
              .moderationReminderSnoozedUntilByUser,
          );
        }

        if (version < 9) {
          const legacy = persistedState as {
            communitiesBeforeShowMore?: number;
            topicsBeforeShowMore?: number;
          };
          state.communitiesBeforeShowMore =
            legacy.communitiesBeforeShowMore ?? legacy.topicsBeforeShowMore ?? 5;
        }

        if (version < 10) {
          const legacy = persistedState as {
            communitiesBeforeShowMore?: number;
            topicsBeforeShowMore?: number;
          };
          if (state.communitiesBeforeShowMore == null) {
            state.communitiesBeforeShowMore = legacy.topicsBeforeShowMore ?? 5;
          }
          delete (state as Record<string, unknown>).topicsBeforeShowMore;
          delete (state as Record<string, unknown>).moderationReminderUnderstoodByUser;
          delete (state as Record<string, unknown>).moderationReminderSnoozedUntilByUser;
          delete (state as Record<string, unknown>).hideInviteCard;
          delete (state as Record<string, unknown>).inviteCardExpanded;
          delete (state as Record<string, unknown>).questsCardExpanded;
        }

        if (version < 11 && (state.adultPromptDismissedAt ?? 0) > 0) {
          state.hasSeenAdultPrompt = true;
        }

        return state as PreferencesState;
      },
    }
  )
);

export const useFeedDensity = (): [FeedDensity, (density: FeedDensity) => void] => {
  const density = usePreferencesStore((s) => s.feedDensity);
  const setDensity = usePreferencesStore((s) => s.setFeedDensity);
  return [density, setDensity];
};
