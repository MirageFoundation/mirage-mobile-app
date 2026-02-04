import { EvilIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  ContentTypeSheet,
  SettingRow,
  ThemeSelector,
  ValuePickerSheet,
  type ContentTypeSheetRef,
  type ValueOption,
  type ValuePickerSheetRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useApiServer } from "@/src/providers/api-server-provider";
import { useToast } from "@/src/providers/toast-provider";
import { usePreferencesStore, type ThemeMode, type ApiServer, type VideoAutoplayNetwork } from "@/src/stores";

// Auto-collapse threshold options
const collapseThresholdOptions: ValueOption<number | null>[] = [
  { value: -10, label: "-10" },
  { value: -5, label: "-5" },
  { value: -3, label: "-3" },
  { value: -1, label: "-1" },
  { value: 0, label: "0" },
  { value: null, label: "Never" },
];

// Sidebar count options
const sidebarCountOptions: ValueOption<number>[] = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 7, label: "7" },
  { value: 10, label: "10" },
  { value: -1, label: "Show All" },
];

// Server options
const apiServerOptions: ValueOption<ApiServer>[] = [
  { value: "mirage.talk", label: "mirage.talk" },
  { value: "mirage.vote", label: "mirage.vote" },
];

// Video autoplay network options
const videoAutoplayNetworkOptions: ValueOption<VideoAutoplayNetwork>[] = [
  { value: "always", label: "Always" },
  { value: "wifi_only", label: "WiFi Only" },
  { value: "never", label: "Never" },
];

type SettingItem = {
  id: string;
  component: React.ReactNode;
};

type Section = {
  title: string;
  data: SettingItem[];
};

export function SettingsScreen() {
 const router = useRouter();
 const insets = useSafeAreaInsets();
 const { theme } = useUnistyles();

// Stores
  const { switchServer } = useApiServer();
  const toast = useToast();
  const {
    theme: themeMode,
    setTheme,
    selectedContentTypes,
    toggleContentType,
    blurSensitiveMedia,
    setBlurSensitiveMedia,
    hideDownvotedPosts,
    setHideDownvotedPosts,
    autoCollapseThreshold,
    setAutoCollapseThreshold,
   topicsBeforeShowMore,
    setTopicsBeforeShowMore,
    peopleBeforeShowMore,
    setPeopleBeforeShowMore,
    autoPlayVideos,
    setAutoPlayVideos,
    videoAutoplayNetwork,
    setVideoAutoplayNetwork,
    apiServer,
    setShareServer,
  } = usePreferencesStore();

  // Sheet refs
  const contentTypeSheetRef = useRef<ContentTypeSheetRef>(null);
  const collapseThresholdSheetRef = useRef<ValuePickerSheetRef>(null);
  const topicsCountSheetRef = useRef<ValuePickerSheetRef>(null);
  const peopleCountSheetRef = useRef<ValuePickerSheetRef>(null);
  const apiServerSheetRef = useRef<ValuePickerSheetRef>(null);
  const videoAutoplayNetworkSheetRef = useRef<ValuePickerSheetRef>(null);

  // Handlers
  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

 const handleThemeChange = useCallback(
    (value: ThemeMode) => {
      setTheme(value);
    },
    [setTheme]
  );

const handleApiServerChange = useCallback(
    async (server: ApiServer) => {
      if (server === apiServer) {
        return;
      }
      
      try {
        await switchServer(server);
        setShareServer(server);
        toast.success(`Switched to ${server}`);
        router.replace("/(tabs)");
      } catch (err) {
        toast.error("Failed to switch server");
      }
    },
    [switchServer, apiServer, toast, router, setShareServer]
  );

  // Get display labels
 const getContentTypeLabel = () => {
   if (selectedContentTypes.includes("all")) return "All";
    if (selectedContentTypes.length === 0) return "None";
   if (selectedContentTypes.length === 1) {
     return (
        selectedContentTypes[0].charAt(0).toUpperCase() +
        selectedContentTypes[0].slice(1)
      );
    }
    return `${selectedContentTypes.length} selected`;
  };

  const getCollapseThresholdLabel = () => {
    if (autoCollapseThreshold === null) return "Never";
    return String(autoCollapseThreshold);
  };

  const getTopicsCountLabel = () => {
    if (topicsBeforeShowMore === -1) return "All";
    return String(topicsBeforeShowMore);
  };

  const getPeopleCountLabel = () => {
    if (peopleBeforeShowMore === -1) return "All";
    return String(peopleBeforeShowMore);
  };

  const getVideoAutoplayNetworkLabel = () => {
    switch (videoAutoplayNetwork) {
      case "always":
        return "Always";
      case "wifi_only":
        return "WiFi Only";
      case "never":
        return "Never";
      default:
        return "Always";
    }
  };

  // Section data
  const sections: Section[] = [
    {
      title: "Content",
      data: [
        {
          id: "content-filter",
          component: (
            <SettingRow
              type="value"
              icon="filter-outline"
              title="Content Type"
              subtitle="Content you see in your feed"
              rightText={getContentTypeLabel()}
              onPress={() => contentTypeSheetRef.current?.present()}
            />
          ),
        },
        {
          id: "blur-sensitive",
          component: (
            <SettingRow
              type="toggle"
              icon="eye-off-outline"
              title="Blur Sensitive Media"
              subtitle="Blur thumbnails of sensitive content"
              value={blurSensitiveMedia}
              onValueChange={setBlurSensitiveMedia}
            />
          ),
        },
        {
          id: "hide-downvoted",
          component: (
            <SettingRow
              type="toggle"
              icon="thumbs-down-outline"
              title="Hide Downvoted Posts"
              subtitle="Immediately hide posts you downvote"
              value={hideDownvotedPosts}
              onValueChange={setHideDownvotedPosts}
            />
          ),
        },
      ],
    },
    {
      title: "Comments",
      data: [
        {
          id: "auto-collapse",
          component: (
            <SettingRow
              type="value"
              icon="chevron-collapse-outline"
              title="Auto-Collapse Threshold"
              subtitle="Collapse comments at or below this score"
              rightText={getCollapseThresholdLabel()}
              onPress={() => collapseThresholdSheetRef.current?.present()}
            />
          ),
        },
      ],
    },
    {
      title: "Sidebar",
      data: [
        {
          id: "topics-count",
          component: (
            <SettingRow
              type="value"
              icon="folder-outline"
              title="Topics Before 'Show More'"
              subtitle="Number of topics shown in sidebar"
              rightText={getTopicsCountLabel()}
              onPress={() => topicsCountSheetRef.current?.present()}
            />
          ),
        },
        {
          id: "people-count",
          component: (
            <SettingRow
              type="value"
              icon="people-outline"
              title="People Before 'Show More'"
              subtitle="Number of people shown in sidebar"
              rightText={getPeopleCountLabel()}
              onPress={() => peopleCountSheetRef.current?.present()}
            />
          ),
        },
      ],
    },
    {
      title: "Dark Mode",
      data: [
        {
          id: "theme",
          component: (
            <ThemeSelector value={themeMode} onChange={handleThemeChange} />
          ),
        },
      ],
    },
    {
      title: "Video",
      data: [
        {
          id: "auto-play-videos",
          component: (
            <SettingRow
              type="toggle"
              icon="play-circle-outline"
              title="Auto-Play Videos"
              subtitle="Automatically play videos in feed"
              value={autoPlayVideos}
              onValueChange={setAutoPlayVideos}
            />
          ),
        },
        {
          id: "video-autoplay-network",
          component: (
            <SettingRow
              type="value"
              icon="wifi-outline"
              title="Autoplay On"
              subtitle="Network type for video autoplay"
              rightText={getVideoAutoplayNetworkLabel()}
              onPress={() => videoAutoplayNetworkSheetRef.current?.present()}
              disabled={!autoPlayVideos}
            />
          ),
      },
    ],
    },
   {
      title: "Server",
      data: [
        {
          id: "api-server",
          component: (
            <SettingRow
              type="value"
              icon="server-outline"
              title="Server"
              subtitle="Server used for API requests and sharing"
              rightText={apiServer}
              onPress={() => apiServerSheetRef.current?.present()}
            />
          ),
        },
      ],
    },
  ];

  const renderItem = ({ item }: { item: SettingItem }) => {
    return <>{item.component}</>;
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => {
    return (
      <View
        style={[
          styles.sectionHeader,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Text
          size="xs"
          weight="semibold"
          mode="subtle"
          style={styles.sectionTitle}
        >
          {section.title.toUpperCase()}
        </Text>
      </View>
    );
  };

  return (
    <Box flex background="subtle">
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Settings
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Settings List */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* Content Type Multi-Select Sheet */}
      <ContentTypeSheet
        ref={contentTypeSheetRef}
        selectedTypes={selectedContentTypes}
        onToggle={toggleContentType}
      />

      {/* Value Picker Sheets */}
      <ValuePickerSheet
        ref={collapseThresholdSheetRef}
        title="Auto-Collapse Threshold"
        options={collapseThresholdOptions}
        value={autoCollapseThreshold}
        onChange={setAutoCollapseThreshold}
      />

      <ValuePickerSheet
        ref={topicsCountSheetRef}
        title="Topics Before 'Show More'"
        options={sidebarCountOptions}
        value={topicsBeforeShowMore}
        onChange={setTopicsBeforeShowMore}
      />

     <ValuePickerSheet
        ref={peopleCountSheetRef}
        title="People Before 'Show More'"
        options={sidebarCountOptions}
        value={peopleBeforeShowMore}
        onChange={setPeopleBeforeShowMore}
      />

      <ValuePickerSheet
        ref={apiServerSheetRef}
        title="Server"
        options={apiServerOptions}
        value={apiServer}
        onChange={handleApiServerChange}
      />

      <ValuePickerSheet
        ref={videoAutoplayNetworkSheetRef}
        title="Video Autoplay Network"
        options={videoAutoplayNetworkOptions}
        value={videoAutoplayNetwork}
        onChange={setVideoAutoplayNetwork}
      />

    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  listContent: {
    paddingTop: theme.spacing.sm,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 0.5,
  },
}));
