import { EvilIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  LogoutConfirmationPopup,
  SettingRow,
  ThemeSelector,
  ValuePickerSheet,
  type ValueOption,
  type ValuePickerSheetRef,
} from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  useAuthStore,
  usePreferencesStore,
  type ContentFilter,
  type ThemeMode,
} from "@/src/stores";

// Content filter options
const contentFilterOptions: ValueOption<ContentFilter>[] = [
  { value: "all", label: "All Content" },
  { value: "sfw", label: "SFW Only" },
  { value: "custom", label: "Custom" },
];

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
  const {
    theme: themeMode,
    setTheme,
    contentFilter,
    setContentFilter,
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
  } = usePreferencesStore();

  // Sheet refs
  const contentFilterSheetRef = useRef<ValuePickerSheetRef>(null);
  const collapseThresholdSheetRef = useRef<ValuePickerSheetRef>(null);
  const topicsCountSheetRef = useRef<ValuePickerSheetRef>(null);
  const peopleCountSheetRef = useRef<ValuePickerSheetRef>(null);

  // Logout popup state
  const [showLogoutPopup, setShowLogoutPopup] = useState(false);

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

  const handleLogout = useCallback(() => {
    logout();
    setShowLogoutPopup(false);
    router.replace("/(tabs)");
  }, [logout, router]);

  // Get display labels
  const getContentFilterLabel = () => {
    return (
      contentFilterOptions.find((o) => o.value === contentFilter)?.label ||
      "All Content"
    );
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
              rightText={getContentFilterLabel()}
              onPress={() => contentFilterSheetRef.current?.present()}
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

      {/* Value Picker Sheets */}
      <ValuePickerSheet
        ref={contentFilterSheetRef}
        title="Content Type"
        options={contentFilterOptions}
        value={contentFilter}
        onChange={setContentFilter}
      />

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

      {/* Logout Confirmation */}
      <LogoutConfirmationPopup
        visible={showLogoutPopup}
        onCancel={() => setShowLogoutPopup(false)}
        onConfirm={handleLogout}
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
