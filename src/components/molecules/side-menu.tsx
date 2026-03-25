import { triggerHaptic } from "@/src/components/utils/haptics";
import { formatCompactNumber } from "@/src/utils/format-number";
import * as Sentry from "@sentry/react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Divider, Text } from "@/src/components/ui/primitives";
import { Avatar } from "@/src/components/atoms";
import {
  useAuthStore,
  usePreferencesStore,
  type ApiServer,
} from "@/src/stores";
import { useRouter } from "@/src/hooks/use-router";
import { LogoutConfirmationPopup } from "./logout-confirmation-popup";
import {
  ValuePickerSheet,
  type ValuePickerSheetRef,
  type ValueOption,
} from "./settings";
import { useApiServer } from "@/src/providers/api-server-provider";
import { useToast } from "@/src/providers/toast-provider";
import { useServerList } from "@/src/hooks/use-server-list";
import {
  useUserFollowed,
  useBatchUsernamesFromAddresses,
  useUserStatus,
} from "@/src/api/read/hooks";
import Constants from "expo-constants";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_WIDTH = SCREEN_WIDTH * 0.8;

type SideMenuProps = {
  onSettings?: () => void;
  onSubscription?: () => void;
  onSaved?: () => void;
  onHistory?: () => void;
  onFollowing?: () => void;
  onTopics?: () => void;
  onAgents?: () => void;
  onInviteAndEarn?: () => void;
  onReferrals?: () => void;
  onQuests?: () => void;
  onHelp?: () => void;
  onAbout?: () => void;
  onLogout?: () => Promise<void>;
  onDismiss?: () => void;
  onOpen?: () => void;
};

export type SideMenuRef = {
  present: () => void;
  dismiss: () => void;
  dismissImmediate: () => void;
};

const MenuItem = ({
  iconName,
  title,
  onPress,
  subtitle,
}: {
  iconName: string;
  title: string;
  onPress?: () => void;
  subtitle?: string;
}) => {
  const { theme } = useUnistyles();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <View
        style={[
          styles.menuIconContainer,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Ionicons
          name={iconName as any}
          size={20}
          color={theme.colors.text.default}
        />
      </View>
      <View style={styles.menuTextContainer}>
        <Text
          style={{ color: theme.colors.text.default }}
          size="md"
          weight="medium"
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{ color: theme.colors.text.subtle }}
            size="sm"
            weight="light"
          >
            {subtitle}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
};

const SHOW_MORE_HITSLOP = { top: 12, bottom: 12, left: 16, right: 16 };

const SectionHeader = ({
  title,
  onShowMore,
}: {
  title: string;
  onShowMore?: () => void;
}) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.sectionHeaderRow}>
      <Text
        style={{ color: theme.colors.text.subtle }}
        size="sm"
        weight="semibold"
      >
        {title.toUpperCase()}
      </Text>
      {onShowMore && (
        <Pressable
          onPress={onShowMore}
          hitSlop={SHOW_MORE_HITSLOP}
          style={({ pressed }) => [
            styles.showMoreButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={{ color: theme.colors.primary[500] }}
            size="sm"
            weight="semibold"
          >
            Show More
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const SectionFooter = ({ style = {} }: { style?: StyleProp<ViewStyle> }) => {
  return (
    <Divider
      direction="horizontal"
      size="extraThin"
      color="subtle"
      style={[styles.sectionFooter, style]}
    />
  );
};

const FollowedUserItem = ({
  address,
  username,
  onPress,
}: {
  address: string;
  username?: string;
  onPress?: () => void;
}) => {
  const { theme } = useUnistyles();
  const displayName = username || address.slice(0, 10) + "...";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.userListItem,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Avatar size="sm" seed={address} rounded="full" />
      <Text
        style={{ color: theme.colors.text.default, flex: 1, marginLeft: 10 }}
        size="md"
        weight="medium"
        numberOfLines={1}
      >
        {displayName}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
};

const FollowedTopicItem = ({
  topic,
  onPress,
}: {
  topic: string;
  onPress?: () => void;
}) => {
  const { theme } = useUnistyles();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.topicListItem,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={{ color: theme.colors.text.default, flex: 1 }}
        size="md"
        weight="medium"
        numberOfLines={1}
      >
        #{topic}
      </Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.text.subtle}
      />
    </Pressable>
  );
};

const LogoutMenuItem = ({ onPress }: { onPress?: () => void }) => {
  const { theme } = useUnistyles();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <View
        style={[
          styles.menuIconContainer,
          { backgroundColor: "rgba(255, 59, 48, 0.15)" },
        ]}
      >
        <Ionicons
          name="log-out-outline"
          size={20}
          color={theme.colors.error[500]}
        />
      </View>
      <View style={styles.menuTextContainer}>
        <Text
          style={{ color: theme.colors.error[500] }}
          size="md"
          weight="medium"
        >
          Log Out
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.error[500]}
      />
    </Pressable>
  );
};

export const SideMenu = forwardRef<SideMenuRef, SideMenuProps>(
  (
    {
      onSettings,
      onSubscription,
      onSaved,
      onHistory,
      onFollowing,
      onTopics,
      onAgents,
      onInviteAndEarn,
      onReferrals,
      onQuests,
      onHelp,
      onAbout,
      onLogout,
      onDismiss,
      onOpen,
    },
    ref,
  ) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [showLogoutPopup, setShowLogoutPopup] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const apiServerSheetRef = useRef<ValuePickerSheetRef>(null);

    const { switchServer } = useApiServer();
    const toast = useToast();
    const { apiServer, setShareServer } = usePreferencesStore();
    const { servers } = useServerList();
    const apiServerOptions = servers.map((s: string) => ({
      value: s,
      label: s,
    }));

    const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
    const walletAddress = useAuthStore((s) => s.user?.walletAddress);

    useEffect(() => {
      if (!isLoggedIn && visible) {
        translateX.value = -MENU_WIDTH;
        backdropOpacity.value = 0;
        setVisible(false);
      }
    }, [isLoggedIn]);

    const { data: userStatus } = useUserStatus();
    const balance = userStatus?.balance
      ? Math.floor(userStatus.balance / 1_000_000)
      : 0;

    const { topicsBeforeShowMore, peopleBeforeShowMore } =
      usePreferencesStore();

    const { data: followedData, isLoading: isLoadingFollowed } =
      useUserFollowed();

    const allFollowedUsers = followedData?.followed_users ?? [];
    const allFollowedTopics = followedData?.followed_topics ?? [];
    const followedUsers =
      peopleBeforeShowMore === -1
        ? allFollowedUsers
        : allFollowedUsers.slice(0, peopleBeforeShowMore);
    const { data: usernameMap } =
      useBatchUsernamesFromAddresses(allFollowedUsers);
    const followedTopics =
      topicsBeforeShowMore === -1
        ? allFollowedTopics
        : allFollowedTopics.slice(0, topicsBeforeShowMore);

    const translateX = useSharedValue(-MENU_WIDTH);
    const backdropOpacity = useSharedValue(0);

    const animationConfig = {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    };

    const open = useCallback(() => {
      setVisible(true);
      translateX.value = withTiming(0, animationConfig);
      backdropOpacity.value = withTiming(0.5, animationConfig);
      onOpen?.();
    }, [onOpen]);

    const close = useCallback(() => {
      translateX.value = withTiming(-MENU_WIDTH, animationConfig);
      backdropOpacity.value = withTiming(0, animationConfig, () => {
        runOnJS(setVisible)(false);
        if (onDismiss) {
          runOnJS(onDismiss)();
        }
      });
    }, [onDismiss]);

    useImperativeHandle(ref, () => ({
      present: open,
      dismiss: close,
      dismissImmediate: () => {
        translateX.value = -MENU_WIDTH;
        backdropOpacity.value = 0;
        setVisible(false);
        onDismiss?.();
      },
    }));

    const menuAnimatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const backdropAnimatedStyle = useAnimatedStyle(() => ({
      opacity: backdropOpacity.value,
    }));

    const handleBackdropPress = useCallback(() => {
      triggerHaptic("light");
      close();
    }, [close]);

    const createHandler = useCallback(
      (handler?: () => void) => () => {
        triggerHaptic("light");
        handler?.();
      },
      [],
    );

    const handleLogoutPress = useCallback(() => {
      triggerHaptic("light");
      setShowLogoutPopup(true);
    }, []);

    const handleLogoutCancel = useCallback(() => {
      setShowLogoutPopup(false);
    }, []);

    const handleCreateAccount = useCallback(() => {
      triggerHaptic("light");
      router.push("/(auth)/username");
    }, [router]);

    const handleLogin = useCallback(() => {
      triggerHaptic("light");
      router.push("/(auth)/login");
    }, [router]);

    const handleLogoutConfirm = useCallback(async () => {
      setIsLoggingOut(true);
      try {
        close();
        await onLogout?.();
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: "side-menu", operation: "logout" },
        });
      } finally {
        setIsLoggingOut(false);
        setShowLogoutPopup(false);
      }
    }, [close, onLogout]);

    const handleServerPress = useCallback(() => {
      apiServerSheetRef.current?.present();
    }, []);

    const handleApiServerChange = useCallback(
      async (server: ApiServer) => {
        if (server === apiServer) return;
        try {
          await switchServer(server);
          setShareServer(server);
          toast.success(`Switched to ${server}`);
          close();
          router.replace("/(tabs)");
        } catch {
          toast.error("Failed to switch server");
        }
      },
      [switchServer, apiServer, toast, router, setShareServer, close],
    );

    const handleShowMoreFollowing = useCallback(() => {
      triggerHaptic("light");
      if (walletAddress) {
        router.push(`/user-following/${walletAddress}`);
      }
    }, [router, walletAddress]);

    const handleUserPress = useCallback(
      (address: string) => {
        triggerHaptic("light");
        router.push(`/user/${address}`);
      },
      [router],
    );

    const handleTopicPress = useCallback(
      (topic: string) => {
        triggerHaptic("light");
        router.push(`/topic/${topic}`);
      },
      [router],
    );

    if (!visible) return null;

    return (
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
            <Pressable
              style={styles.backdropPressable}
              onPress={handleBackdropPress}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.menuPanel,
              { backgroundColor: theme.colors.background.default },
              menuAnimatedStyle,
            ]}
          >
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
              <Text size="xl" weight="bold">
                Menu
              </Text>
              <View style={styles.headerRight}>
                <Pressable
                  onPress={close}
                  style={[
                    styles.closeButton,
                    { backgroundColor: theme.colors.background.subtle },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={theme.colors.text.default}
                  />
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: 20 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {isLoggedIn ? (
                <>
                  <View style={styles.balanceCard}>
                    <Text
                      style={{ color: theme.colors.text.subtle, marginTop: 2 }}
                      size="sm"
                      weight="semibold"
                    >
                      BALANCE
                    </Text>
                    <Text
                      style={{ color: theme.colors.text.default }}
                      size="xl"
                      weight="bold"
                    >
                      {formatCompactNumber(balance)} MIRAGE
                    </Text>
                  </View>
                  <SectionFooter />

                  <SectionHeader title="Rewards & Plans" />
                  {Platform.OS !== "ios" && (
                    <MenuItem
                      iconName="diamond-outline"
                      title="Perks"
                      subtitle="Update subscription"
                      onPress={createHandler(onSubscription)}
                    />
                  )}
                  <MenuItem
                    iconName="gift-outline"
                    title="Invite a Friend"
                    subtitle="Get rewards"
                    onPress={createHandler(onInviteAndEarn)}
                  />
                  <MenuItem
                    iconName="people-outline"
                    title="Referrals"
                    subtitle="Share your link & track signups"
                    onPress={createHandler(onReferrals)}
                  />
                  <MenuItem
                    iconName="trophy-outline"
                    title="Daily Quests"
                    subtitle="Complete tasks for rewards"
                    onPress={createHandler(onQuests)}
                  />
                  <SectionFooter />

                  {/* Content Section */}
                  <SectionHeader title="Content" />
                  <MenuItem
                    iconName="bookmark-outline"
                    title="Saved"
                    subtitle="Your bookmarked posts"
                    onPress={createHandler(onSaved)}
                  />
                  <MenuItem
                    iconName="time-outline"
                    title="History"
                    subtitle="Recently viewed"
                    onPress={createHandler(onHistory)}
                  />
                  <SectionFooter />

                  {/* Social Section */}
                  <SectionHeader title="Social" />
                  <MenuItem
                    iconName="people-outline"
                    title="Following"
                    subtitle="Users and topics you follow"
                    onPress={createHandler(onFollowing)}
                  />
                  <MenuItem
                    iconName="pricetags-outline"
                    title="Topics"
                    subtitle="Explore all topics"
                    onPress={createHandler(onTopics)}
                  />
                  <MenuItem
                    iconName="shield-checkmark-outline"
                    title="Agents"
                    subtitle="Browse and enable agents"
                    onPress={createHandler(onAgents)}
                  />
                  <SectionFooter />

                  {/* Followed Users */}
                  <SectionHeader
                    title="Followed Users"
                    onShowMore={
                      allFollowedUsers.length > followedUsers.length
                        ? handleShowMoreFollowing
                        : undefined
                    }
                  />
                  {isLoadingFollowed ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.text.subtle}
                      />
                    </View>
                  ) : followedUsers.length > 0 ? (
                    followedUsers.map((address) => (
                      <FollowedUserItem
                        key={address}
                        address={address}
                        username={usernameMap?.[address.toLowerCase()]}
                        onPress={() => handleUserPress(address)}
                      />
                    ))
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.text.subtle,
                        paddingVertical: 8,
                      }}
                      size="sm"
                    >
                      Not following anyone yet
                    </Text>
                  )}
                  <SectionFooter />

                  {/* Followed Topics */}
                  <SectionHeader
                    title="Followed Topics"
                    onShowMore={
                      allFollowedTopics.length > followedTopics.length
                        ? handleShowMoreFollowing
                        : undefined
                    }
                  />
                  {isLoadingFollowed ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator
                        size="small"
                        color={theme.colors.text.subtle}
                      />
                    </View>
                  ) : followedTopics.length > 0 ? (
                    followedTopics.map((topic) => (
                      <FollowedTopicItem
                        key={topic}
                        topic={topic}
                        onPress={() => handleTopicPress(topic)}
                      />
                    ))
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.text.subtle,
                        paddingVertical: 8,
                      }}
                      size="sm"
                    >
                      No followed topics yet
                    </Text>
                  )}
                  <SectionFooter />

                  {/* App Section */}
                  <SectionHeader title="App" />
                  <MenuItem
                    iconName="settings-outline"
                    title="Settings"
                    subtitle="App preferences"
                    onPress={createHandler(onSettings)}
                  />
                  <MenuItem
                    iconName="help-circle-outline"
                    title="Help & Support"
                    subtitle="FAQs and contact"
                    onPress={createHandler(onHelp)}
                  />
                  <MenuItem
                    iconName="information-circle-outline"
                    title="About"
                    subtitle="App info and legal"
                    onPress={createHandler(onAbout)}
                  />
                  <SectionFooter />

                  {/* Account Section */}
                  <SectionHeader title="Account" />
                  <LogoutMenuItem onPress={handleLogoutPress} />

                  <View style={styles.versionContainer}>
                    <Text
                      style={{ color: theme.colors.text.subtle }}
                      size="sm"
                      weight="light"
                    >
                      v{Constants.expoConfig?.version ?? "1.0.0"} ({Platform.OS}
                      )
                    </Text>

                    {(__DEV__ ||
                      process.env.EXPO_PUBLIC_ENV === "dev" ||
                      process.env.EXPO_PUBLIC_ENV === "preview") && (
                      <>
                        <Text
                          style={{ color: theme.colors.text.subtle }}
                          size="sm"
                          weight="light"
                        >
                          update 102
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.text.subtle,
                            textAlign: "center",
                          }}
                          size="sm"
                          weight="light"
                        >
                          pagination issue in feed not fetching the next pages
                          fixed,account creation stuck on button loading
                          fix,better sentry logs added in account creation,image
                          not showing up in comment just created fixed, palm
                          tree cut on login and account creation screen fix,
                          made video sync through feed post details screen and
                          full screen more quick and snappier, independent video
                          sync through different feeds, sentry log RN-K error
                          handling,sentry log REACT-NATIVE-F — N+1 API Call
                          error fixed and handled,more sentry logs added
                        </Text>
                      </>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <SectionHeader title="Get Started" />
                  <MenuItem
                    iconName="person-add-outline"
                    title="Create Account"
                    subtitle="Set up your identity"
                    onPress={handleCreateAccount}
                  />
                  <MenuItem
                    iconName="log-in-outline"
                    title="Login"
                    subtitle="I already have an account"
                    onPress={handleLogin}
                  />

                  <View style={styles.versionContainer}>
                    <Text
                      style={{ color: theme.colors.text.subtle }}
                      size="sm"
                      weight="light"
                    >
                      v{Constants.expoConfig?.version ?? "1.0.0"} ({Platform.OS}
                      )
                    </Text>

                    {(__DEV__ ||
                      process.env.EXPO_PUBLIC_ENV === "dev" ||
                      process.env.EXPO_PUBLIC_ENV === "preview") && (
                      <>
                        <Text
                          style={{ color: theme.colors.text.subtle }}
                          size="sm"
                          weight="light"
                        >
                          update 102
                        </Text>
                        <Text
                          style={{
                            color: theme.colors.text.subtle,
                            textAlign: "center",
                          }}
                          size="sm"
                          weight="light"
                        >
                          pagination issue in feed not fetching the next pages
                          fixed,account creation stuck on button loading
                          fix,better sentry logs added in account creation,image
                          not showing up in comment just created fixed, palm
                          tree cut on login and account creation screen fix,
                          made video sync through feed post details screen and
                          full screen more quick and snappier, independent video
                          sync through different feeds, sentry log RN-K error
                          handling,sentry log REACT-NATIVE-F — N+1 API Call
                          error fixed and handled,more sentry logs added
                        </Text>
                      </>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </Animated.View>

          <LogoutConfirmationPopup
            visible={showLogoutPopup}
            onCancel={handleLogoutCancel}
            onConfirm={handleLogoutConfirm}
            isLoading={isLoggingOut}
          />

          <ValuePickerSheet
            ref={apiServerSheetRef}
            title="Server"
            options={apiServerOptions}
            value={apiServer}
            onChange={handleApiServerChange}
          />
        </View>
      </View>
    );
  },
);

SideMenu.displayName = "SideMenu";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 1,
    elevation: 1,
  },
  backdropPressable: {
    flex: 1,
  },
  menuPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: MENU_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    zIndex: 2,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  sectionHeader: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  showMoreButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 2,
    gap: theme.spacing.md,
  },
  toggleItem: {
    justifyContent: "space-between",
  },
  switchContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextContainer: {
    flex: 1,
  },
  sectionFooter: {
    marginVertical: theme.spacing.sm,
    width: SCREEN_WIDTH,
    alignSelf: "center",
  },
  userListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
  },
  topicListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 2,
    gap: theme.spacing.sm,
  },
  loadingContainer: {
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
  balanceCard: {
    paddingVertical: theme.spacing.md,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  versionContainer: {
    alignItems: "center",
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
}));
