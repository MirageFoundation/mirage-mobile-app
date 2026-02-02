import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

export type FeedType = "home" | "popular" | "news" | "watch" | "latest";
export type ThemeMode = "light" | "dark" | "system";
export type ShareServer = "mirage.talk" | "mirage.vote";
export type ApiServer = "mirage.talk" | "mirage.vote";
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
  if (!types || types.length === 0) return ["none"];
  if (types.includes("all")) return ["all"];
  if (types.includes("none")) return ["none"];

  const unique = Array.from(new Set(types));
  const filtered = unique.filter((type) => type !== "all" && type !== "none");

  return filtered.length === 0 ? ["none"] : filtered;
};

export const getAllowedTagsFromContentTypes = (
  types: ContentType[]
): string => {
  const normalized = normalizeContentTypes(types);
  if (normalized.includes("all")) return CONTENT_TAGS.join(",");
  if (normalized.includes("none")) return "";

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

  // Actions
  setFeedType: (type: FeedType) => void;
  setFollowingFeedType: (type: FeedType) => void;
  setTheme: (theme: ThemeMode) => void;
  setAdultContent: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setSelectedContentTypes: (types: ContentType[]) => void;
  toggleContentType: (type: ContentType) => void;
  setBlurSensitiveMedia: (blur: boolean) => void;
  setHideDownvotedPosts: (hide: boolean) => void;
  setAutoCollapseThreshold: (threshold: number | null) => void;
  setTopicsBeforeShowMore: (count: number) => void;
  setPeopleBeforeShowMore: (count: number) => void;
  setShareServer: (server: ShareServer) => void;
  setApiServer: (server: ApiServer) => void;
  setAutoPlayVideos: (autoPlay: boolean) => void;
  setVideoAutoplayNetwork: (network: VideoAutoplayNetwork) => void;
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
      hasSeenAdultPrompt: false,
      selectedContentTypes: ["sensitive"],
      blurSensitiveMedia: true,
      hideDownvotedPosts: false,

      // Comments
      autoCollapseThreshold: -5,

      // Sidebar
      topicsBeforeShowMore: 5,
      peopleBeforeShowMore: 5,

      // Sharing
      shareServer: "mirage.talk",

      // API Server
      apiServer: "mirage.vote",

      // Video
      autoPlayVideos: true,
      videoAutoplayNetwork: "always",

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
          // If selecting "all", clear others and set only "all"
          if (type === "all") {
            return {
              selectedContentTypes: ["all"],
              adultContentEnabled: true,
            };
          }
          // If selecting "none", clear others and set only "sensitive" (safe content only)
          if (type === "none") {
            return {
              selectedContentTypes: ["sensitive"],
              adultContentEnabled: false,
            };
          }

          // Remove "all" and "none" if selecting specific types
          let newTypes = state.selectedContentTypes.filter(
            (t) => t !== "all" && t !== "none"
          );

          // Toggle the selected type
          if (newTypes.includes(type)) {
            newTypes = newTypes.filter((t) => t !== type);
          } else {
            newTypes = [...newTypes, type];
          }

          // If nothing selected, default to "sensitive"
          if (newTypes.length === 0) {
            return {
              selectedContentTypes: ["sensitive"],
              adultContentEnabled: false,
            };
          }

          return {
            selectedContentTypes: newTypes,
            adultContentEnabled: isAdultContentEnabled(newTypes),
          };
        }),
      setBlurSensitiveMedia: (blur) => set({ blurSensitiveMedia: blur }),
      setHideDownvotedPosts: (hide) => set({ hideDownvotedPosts: hide }),
      setAutoCollapseThreshold: (threshold) =>
        set({ autoCollapseThreshold: threshold }),
      setTopicsBeforeShowMore: (count) => set({ topicsBeforeShowMore: count }),
      setPeopleBeforeShowMore: (count) => set({ peopleBeforeShowMore: count }),
      setShareServer: (server) => set({ shareServer: server }),
      setApiServer: (server) => set({ apiServer: server }),
      setAutoPlayVideos: (autoPlay) => set({ autoPlayVideos: autoPlay }),
      setVideoAutoplayNetwork: (network) => set({ videoAutoplayNetwork: network }),
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Partial<PreferencesState>;
        
        // Migration from version 0 (no version) to version 1
        // Reset theme to "system" (automatic) as the new default
        if (version === 0) {
          state.theme = "system";
        }

        if (Array.isArray(state.selectedContentTypes)) {
          const normalized = normalizeContentTypes(
            state.selectedContentTypes as ContentType[]
          );
          state.selectedContentTypes = normalized;
          state.adultContentEnabled = isAdultContentEnabled(normalized);
        }
        
        return state as PreferencesState;
      },
    }
  )
);
