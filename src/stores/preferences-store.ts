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
  | "porn"
  | "violence"
  | "gore"
  | "death"
  | "none"
  | "all";

const CONTENT_TAGS = ["sensitive", "porn", "violence", "gore", "death"] as const;
const ADULT_CONTENT_TAGS = ["porn", "violence", "gore", "death"] as const;

type ContentTag = (typeof CONTENT_TAGS)[number];

const normalizeContentTypes = (types: ContentType[]): ContentType[] => {
  if (!types || types.length === 0) return [];
 if (types.includes("all")) return ["all"];
  if (types.includes("none")) return [];

 const unique = Array.from(new Set(types));
 const filtered = unique.filter((type) => type !== "all" && type !== "none");

  return filtered.length === 0 ? [] : filtered;
};

export const getAllowedTagsFromContentTypes = (
  types: ContentType[]
): string => {
 const normalized = normalizeContentTypes(types);
 if (normalized.includes("all")) return CONTENT_TAGS.join(",");
  if (normalized.length === 0) return "";

 const selected = new Set(normalized);
  return CONTENT_TAGS.filter((tag) => selected.has(tag)).join(",");
};

export const isAdultContentEnabled = (types: ContentType[]): boolean => {
  if (!types || types.length === 0) return false;
  if (types.includes("all")) return true;
  return types.some((type) =>
    ADULT_CONTENT_TAGS.includes(type as ContentTag)
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
            if (state.selectedContentTypes.includes("all")) {
              return { adultContentEnabled: true };
            }

            const baseTypes = state.selectedContentTypes.filter(
              (type) => type !== "none" && type !== "all"
            );
            const nextSet = new Set<ContentType>(baseTypes);

            for (const tag of ADULT_CONTENT_TAGS) {
              nextSet.add(tag);
            }

            if (baseTypes.length === 0) {
              nextSet.add("sensitive");
            }

            const nextTypes = Array.from(nextSet);
            return {
              adultContentEnabled: true,
              selectedContentTypes: nextTypes.length ? nextTypes : ["porn"],
            };
          }

          if (state.selectedContentTypes.includes("all")) {
            return {
              adultContentEnabled: false,
              selectedContentTypes: ["sensitive"],
            };
          }

          const baseTypes = state.selectedContentTypes.filter(
            (type) => type !== "none" && type !== "all"
          );
          const filteredTypes = baseTypes.filter(
            (type) => !ADULT_CONTENT_TAGS.includes(type as ContentTag)
          );

          return {
            adultContentEnabled: false,
            selectedContentTypes: filteredTypes.length
              ? filteredTypes
              : ["sensitive"],
          };
        }),
      setHasSeenAdultPrompt: () => set({ hasSeenAdultPrompt: true }),
      setSelectedContentTypes: (types) => {
        const normalized = normalizeContentTypes(types);
        set({
          selectedContentTypes: normalized,
          adultContentEnabled: isAdultContentEnabled(normalized),
        });
      },
     toggleContentType: (type) =>
       set((state) => {
         if (type === "all") {
           const hasPorn = state.selectedContentTypes.includes("porn");
           const nonPornTags: ContentType[] = [...CONTENT_TAGS].filter((t) => t !== "porn");
           if (hasPorn) {
             return {
               selectedContentTypes: [...nonPornTags, "porn"],
               adultContentEnabled: true,
             };
           }
           return {
             selectedContentTypes: nonPornTags,
             adultContentEnabled: false,
           };
         }
        if (type === "none") {
          const hadPorn = state.selectedContentTypes.includes("porn");
          if (hadPorn) {
            return {
              selectedContentTypes: ["porn"],
              adultContentEnabled: true,
            };
          }
          return {
             selectedContentTypes: [],
            adultContentEnabled: false,
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

        if (newTypes.length === 0) {
          return {
             selectedContentTypes: [],
             adultContentEnabled: false,
           };
          }

          return {
            selectedContentTypes: newTypes,
            adultContentEnabled: isAdultContentEnabled(newTypes),
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
      version: 2,
      version: 3,
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
        }
        
        return state as PreferencesState;
      },
    }
  )
);
