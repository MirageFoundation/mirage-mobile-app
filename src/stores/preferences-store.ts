import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";
export type ThemeMode = "light" | "dark" | "system";
export type ShareServer = string;
export type ApiServer = string;
export type VideoAutoplayNetwork = "always" | "wifi_only" | "never";
export type ContentType =
  | "sensitive"
  | "adult"
  | "violence"
  | "gore"
  | "death"
  | "none"
  | "all";

const CONTENT_TAGS = ["sensitive", "adult", "violence", "gore", "death"] as const;
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

  // Theme
  theme: ThemeMode;

  // Content
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  adultPromptDismissedAt: number;
  moderationReminderUnderstoodByUser: Record<string, boolean>;
  moderationReminderSnoozedUntilByUser: Record<string, number>;
  selectedContentTypes: ContentType[];
  blurSensitiveMedia: boolean;
  ageVerified: boolean;
  hideDownvotedPosts: boolean;

  // Comments
  autoCollapseThreshold: number | null; // -10, -5, -3, -1, 0, or null (never)

  // Sidebar
  topicsBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)
  peopleBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)

  // Sharing
  shareServer: ShareServer;

  // API Server
  apiServer: ApiServer;

 // Video
 autoPlayVideos: boolean;
 videoAutoplayNetwork: VideoAutoplayNetwork;

 // Home Screen Cards
 hideInviteCard: boolean;
  inviteCardExpanded: boolean;
  questsCardExpanded: boolean;

// Actions
 setFeedType: (type: FeedType) => void;
  setFollowingFeedType: (type: FeedType) => void;
  setTheme: (theme: ThemeMode) => void;
  setAdultContent: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setAdultPromptDismissedAt: (timestamp: number) => void;
  dismissModerationReminder: (userId: string) => void;
  snoozeModerationReminder: (userId: string, until: number) => void;
  setSelectedContentTypes: (types: ContentType[]) => void;
  toggleContentType: (type: ContentType) => void;
  setBlurSensitiveMedia: (blur: boolean) => void;
  setAgeVerified: (verified: boolean) => void;
  setHideDownvotedPosts: (hide: boolean) => void;
  setAutoCollapseThreshold: (threshold: number | null) => void;
  setTopicsBeforeShowMore: (count: number) => void;
  setPeopleBeforeShowMore: (count: number) => void;
  setShareServer: (server: ShareServer) => void;
  setApiServer: (server: ApiServer) => void;
 setAutoPlayVideos: (autoPlay: boolean) => void;
 setVideoAutoplayNetwork: (network: VideoAutoplayNetwork) => void;
 setHideInviteCard: (hide: boolean) => void;
  setInviteCardExpanded: (expanded: boolean) => void;
  setQuestsCardExpanded: (expanded: boolean) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      // Feed
      feedType: "home",
      followingFeedType: "home",

      // Theme
      theme: "system",

      // Content
      adultContentEnabled: false,
      hasSeenAdultPrompt: true,
      adultPromptDismissedAt: 0,
      moderationReminderUnderstoodByUser: {},
      moderationReminderSnoozedUntilByUser: {},
      selectedContentTypes: ["sensitive"],
      blurSensitiveMedia: false,
      ageVerified: false,
      hideDownvotedPosts: false,

      // Comments
      autoCollapseThreshold: -5,

      // Sidebar
      topicsBeforeShowMore: 5,
      peopleBeforeShowMore: 5,

      // Sharing
      shareServer: "mirage.talk",

      // API Server
      apiServer: "mirage.talk",

     // Video
     autoPlayVideos: true,
     videoAutoplayNetwork: "always",

     // Home Screen Cards
     hideInviteCard: false,
      inviteCardExpanded: true,
      questsCardExpanded: true,

    // Actions
     setFeedType: (type) => set({ feedType: type }),
      setFollowingFeedType: (type) => set({ followingFeedType: type }),
      setTheme: (theme) => set({ theme }),
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
      dismissModerationReminder: (userId) =>
        set((state) => ({
          moderationReminderUnderstoodByUser: {
            ...state.moderationReminderUnderstoodByUser,
            [userId]: true,
          },
          moderationReminderSnoozedUntilByUser: {
            ...state.moderationReminderSnoozedUntilByUser,
            [userId]: 0,
          },
        })),
      snoozeModerationReminder: (userId, until) =>
        set((state) => ({
          moderationReminderSnoozedUntilByUser: {
            ...state.moderationReminderSnoozedUntilByUser,
            [userId]: until,
          },
        })),
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
      setAutoCollapseThreshold: (threshold) =>
        set({ autoCollapseThreshold: threshold }),
      setTopicsBeforeShowMore: (count) => set({ topicsBeforeShowMore: count }),
      setPeopleBeforeShowMore: (count) => set({ peopleBeforeShowMore: count }),
      setShareServer: (server) => set({ shareServer: server }),
     setApiServer: (server) => set({ apiServer: server }),
     setAutoPlayVideos: (autoPlay) => set({ autoPlayVideos: autoPlay }),
     setVideoAutoplayNetwork: (network) => set({ videoAutoplayNetwork: network }),
     setHideInviteCard: (hide) => set({ hideInviteCard: hide }),
      setInviteCardExpanded: (expanded) => set({ inviteCardExpanded: expanded }),
      setQuestsCardExpanded: (expanded) => set({ questsCardExpanded: expanded }),
  }),
   {
     name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
      version: 5,
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
          state.moderationReminderUnderstoodByUser =
            state.moderationReminderUnderstoodByUser ?? {};
          state.moderationReminderSnoozedUntilByUser =
            state.moderationReminderSnoozedUntilByUser ?? {};
        }

        return state as PreferencesState;
      },
    }
  )
);
