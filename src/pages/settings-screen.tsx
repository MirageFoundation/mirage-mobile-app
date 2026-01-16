import { EvilIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  ContentTypeSheet,
  LogoutConfirmationPopup,
  SettingRow,
  ThemeSelector,
  ValuePickerSheet,
  type ContentTypeSheetRef,
  type ValueOption,
  type ValuePickerSheetRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useQueryClear } from "@/src/providers/query-clear-provider";
import { useAuthStore, useDraftStore, useSearchStore, usePreferencesStore, type ThemeMode, type ShareServer } from "@/src/stores";

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

// Share server options
const shareServerOptions: ValueOption<ShareServer>[] = [
  { value: "mirage.talk", label: "mirage.talk" },
  { value: "mirage.vote", label: "mirage.vote" },
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
  const logout = useAuthStore((s) => s.logout);
  const clearDraft = useDraftStore((s) => s.clearDraft);
  const clearRecentSearches = useSearchStore((s) => s.clearRecentSearches);
  const { clearQueries } = useQueryClear();
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
    shareServer,
    setShareServer,
  } = usePreferencesStore();

  // Sheet refs
  const contentTypeSheetRef = useRef<ContentTypeSheetRef>(null);
  const collapseThresholdSheetRef = useRef<ValuePickerSheetRef>(null);
  const topicsCountSheetRef = useRef<ValuePickerSheetRef>(null);
  const peopleCountSheetRef = useRef<ValuePickerSheetRef>(null);
  const shareServerSheetRef = useRef<ValuePickerSheetRef>(null);

  // Logout popup state
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    
    try {
      // Clear all user data
      await logout();
      clearDraft();
      clearRecentSearches();
      await clearQueries();
      
      setShowLogoutPopup(false);
      router.replace("/(tabs)");
    } catch (error) {
      console.error("[SettingsScreen] Logout failed:", error);
    } finally {
      setIsLoggingOut(false);
    }
  }, [logout, clearDraft, clearRecentSearches, clearQueries, router]);

  // Get display labels
  const getContentTypeLabel = () => {
    if (selectedContentTypes.includes("all")) return "All";
    if (selectedContentTypes.includes("none")) return "None";
    // Show "None" if only sensitive content is selected (no adult content)
    if (
      selectedContentTypes.length === 1 &&
      selectedContentTypes[0] === "sensitive"
    ) {
      return "None";
    }
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
      title: "Sharing",
      data: [
        {
          id: "share-server",
          component: (
            <SettingRow
              type="value"
              icon="share-social-outline"
              title="Share Server"
              subtitle="Server used for sharing links"
              rightText={shareServer}
              onPress={() => shareServerSheetRef.current?.present()}
            />
          ),
        },
      ],
    },
    {
      title: "Account",
      data: [
        {
          id: "logout",
          component: (
            <SettingRow
              type="navigate"
              icon="log-out-outline"
              title="Log Out"
              onPress={() => setShowLogoutPopup(true)}
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
        ref={shareServerSheetRef}
        title="Share Server"
        options={shareServerOptions}
        value={shareServer}
        onChange={setShareServer}
      />

      {/* Logout Confirmation */}
      <LogoutConfirmationPopup
        visible={showLogoutPopup}
        onCancel={() => setShowLogoutPopup(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
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
