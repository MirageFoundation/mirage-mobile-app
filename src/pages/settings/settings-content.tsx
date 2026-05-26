import * as Sentry from "@sentry/react-native";
import { EvilIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  ContentTypeSheet,
  ConfirmationPopup,
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
import { isAdultContentEnabled } from "@/src/stores/preferences-store";
import { useServerList } from "@/src/hooks/use-server-list";
import { runInboxCheckNow, sendTestNotification, resetAndTestInboxNotification, getNotificationDebugInfo } from "@/src/services/inbox-notifications";
import { useCloudflareErrorStore } from "@/src/stores/cloudflare-error-store";
import * as Clipboard from "expo-clipboard";
import { storage } from "@/src/stores/mmkv-storage";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";

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
    adultContentEnabled,
    setAdultContent,
    toggleContentType,
    setSelectedContentTypes,
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

  const adultContentActive = isAdultContentEnabled(selectedContentTypes);
  const hasAnyContentEnabled = selectedContentTypes.length > 0;

  const handleBlurToggle = useCallback((value: boolean) => {
    setBlurSensitiveMedia(value);
  }, [setBlurSensitiveMedia]);

  const [showMatureConfirm, setShowMatureConfirm] = useState(false);

  const handleMatureToggle = useCallback((value: boolean) => {
    if (value) {
      setShowMatureConfirm(true);
    } else {
      setAdultContent(false);
    }
  }, [setAdultContent]);

  const handleConfirmMature = useCallback(() => {
    setAdultContent(true);
    setBlurSensitiveMedia(true);
    setShowMatureConfirm(false);
  }, [setAdultContent, setBlurSensitiveMedia]);

  const handleCancelMature = useCallback(() => {
    setShowMatureConfirm(false);
  }, []);

  const { servers } = useServerList();
  const apiServerOptions = servers.map((s) => ({ value: s, label: s }));

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
        setTimeout(() => {
          useHomePostCardStore.getState().setSideMenuOpen(false);
          Sentry.addBreadcrumb({
            category: "feed-video",
            message: "Released feed playback after settings server switch",
            level: "info",
            data: { server },
          });
        }, 350);
      } catch (err) {
        Sentry.captureException(err, { tags: { feature: "settings", operation: "switch-server" } });
        toast.error("Failed to switch server");
        useHomePostCardStore.getState().setSideMenuOpen(false);
        Sentry.addBreadcrumb({
          category: "feed-video",
          message: "Released feed playback after failed settings server switch",
          level: "warning",
          data: { server },
        });
      }
    },
    [switchServer, apiServer, toast, router, setShareServer]
  );

  // Get display labels
 const getContentTypeLabel = () => {
   const ALL_TAGS = ["sensitive", "adult", "violence", "gore", "death"];
   const allSelected = ALL_TAGS.every((t) => selectedContentTypes.includes(t as any));
   if (allSelected) return "All";
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

  const handleEditUsername = useCallback(() => {
    triggerHaptic("light");
    router.push("/change-username");
  }, [router]);

  // Section data
  const sections: Section[] = [
    {
      title: "Account",
      data: [
        {
          id: "edit-username",
          component: (
            <SettingRow
              type="value"
              iconElement={<MaterialCommunityIcons name="account-edit-outline" size={20} color={theme.colors.text.default} />}
              title="Edit Username"
              subtitle="Change your display name"
              rightText=""
              onPress={handleEditUsername}
            />
          ),
        },

      ],
    },
    {
      title: "Content",
      data: [
        {
          id: "content-filter",
          component: (
            <SettingRow
              type="value"
              icon="filter-outline"
              title="Content Filter"
              subtitle="Adult content is hidden by default"
              rightText={getContentTypeLabel()}
              onPress={() => contentTypeSheetRef.current?.present()}
            />
          ),
        },
        {
          id: "show-mature-content",
          component: (
            <SettingRow
              type="toggle"
              icon="eye-off-outline"
              title="Show Mature Content"
              subtitle="I'm over 18"
              value={adultContentEnabled}
              onValueChange={handleMatureToggle}
            />
          ),
        },
        {
          id: "blur-sensitive",
          component: (
            <SettingRow
              type="toggle"
              icon="eye-off-outline"
              title="Blur Mature Media"
              subtitle="Blur mature (18+) images and media"
              value={blurSensitiveMedia}
              onValueChange={handleBlurToggle}
              disabled={!adultContentEnabled}
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
    {
      title: "Security",
      data: [
        {
          id: "view-recovery-phrase",
          component: (
            <SettingRow
              type="value"
              icon="key-outline"
              title="Recovery Phrase"
              subtitle="View your wallet recovery phrase"
              rightText=""
              onPress={() => router.push("/view-recovery-phrase")}
            />
          ),
        },
      ],
    },
    {
      title: "Danger Zone",
      data: [
        {
          id: "delete-account",
          component: (
            <SettingRow
              type="navigate"
              icon="trash-outline"
              title="Delete Account"
              subtitle="Permanently delete your account"
              onPress={() => router.push("/delete-account")}
            />
          ),
        },
      ],
    },
    ...(process.env.EXPO_PUBLIC_ENV === "preview" ? [{
      title: "Push Notifications",
      data: [
        {
          id: "copy-push-token",
          component: (
            <SettingRow
              type="navigate"
              icon="copy-outline"
              title="Copy Push Token"
              subtitle={storage.getString("push-token") ?? "No token registered"}
              onPress={async () => {
                const token = storage.getString("push-token");
                if (token) {
                  await Clipboard.setStringAsync(token);
                  toast.success("Push token copied!");
                } else {
                  toast.error("No push token registered");
                }
              }}
            />
          ),
        },
      ],
    }] : []),
    ...(__DEV__ ? [{
      title: "Notifications",
      data: [
        {
          id: "notification-status",
          component: (() => {
            const info = getNotificationDebugInfo();
            return (
              <SettingRow
                type="navigate"
                icon="information-circle-outline"
                title="Background Fetch Status"
                subtitle={`Last check: ${info.lastCheck} | Tracked: ${info.notifiedCount} | Seeded: ${info.isSeeded}`}
                onPress={() => {
                  const fresh = getNotificationDebugInfo();
                  toast.success(`Last: ${fresh.lastCheck} | IDs: ${fresh.notifiedCount}`);
                }}
              />
            );
          })(),
        },
        {
          id: "test-notification",
          component: (
            <SettingRow
              type="navigate"
              icon="notifications-outline"
              title="Check Inbox Now"
              subtitle="Fetch inbox and notify for any new replies"
              onPress={() => {
                runInboxCheckNow();
                toast.success("Checking inbox for new replies...");
              }}
            />
          ),
        },
        {
          id: "send-test-notification",
          component: (
            <SettingRow
              type="navigate"
              icon="pulse-outline"
              title="Send Test Notification"
              subtitle="Fire a dummy notification to verify they work"
              onPress={() => {
                sendTestNotification();
                toast.success("Test notification sent!");
              }}
            />
          ),
        },
        {
          id: "reset-and-test",
          component: (
            <SettingRow
              type="navigate"
              icon="refresh-outline"
              title="Reset & Test Inbox"
              subtitle="Clears seen replies, re-fetches inbox, notifies for all"
              onPress={() => {
                resetAndTestInboxNotification();
                toast.success("Reset done, checking inbox...");
              }}
            />
          ),
        },
        {
          id: "copy-push-token",
          component: (
            <SettingRow
              type="navigate"
              icon="copy-outline"
              title="Copy Push Token"
              subtitle={storage.getString("push-token") ?? "No token registered"}
              onPress={async () => {
                const token = storage.getString("push-token");
                if (token) {
                  await Clipboard.setStringAsync(token);
                  toast.success("Push token copied!");
                } else {
                  toast.error("No push token registered");
                }
              }}
            />
          ),
        },
      ],
    },
    {
      title: "Sentry",
      data: [
        {
          id: "sentry-test",
          component: (
            <SettingRow
              type="navigate"
              icon="bug-outline"
              title="Test Sentry"
              subtitle="Send a test error to Sentry"
              onPress={() => {
                Sentry.captureException(new Error("First error"));
                toast.success("Test error sent to Sentry!");
              }}
            />
          ),
        },
      ],
    },
    {
      title: "Cloudflare Error",
      data: [
        {
          id: "test-cloudflare-error",
          component: (
            <SettingRow
              type="navigate"
              icon="cloud-offline-outline"
              title="Test Cloudflare Error Toast"
              subtitle="Simulate a Cloudflare 5xx error"
              onPress={() => {
                useCloudflareErrorStore.getState().setError(521);
                toast.success("Cloudflare error simulated!");
              }}
            />
          ),
        },
      ],
    }] : []),
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
        matureToggleEnabled={adultContentEnabled}
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

      <ConfirmationPopup
        visible={showMatureConfirm}
        title="Enable mature content"
        message="To update your settings to show mature content, confirm you're over 18."
        description="After updating, you can visit your settings at any time to hide mature content again."
        icon="eye-off"
        confirmText="Yes, I'm over 18"
        cancelText="Go back"
        isDestructive={false}
        onConfirm={handleConfirmMature}
        onCancel={handleCancelMature}
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
