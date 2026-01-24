import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleProp,
  Switch,
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
import { useAuthStore, usePreferencesStore } from "@/src/stores";
import { useRouter } from "expo-router";
import { LogoutConfirmationPopup } from "./logout-confirmation-popup";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MENU_WIDTH = SCREEN_WIDTH * 0.8; // 80% of screen width

type SideMenuProps = {
  onSettings?: () => void;
  onSubscription?: () => void;
  onSaved?: () => void;
  onHistory?: () => void;
  onDrafts?: () => void;
  onNetwork?: () => void;
  onInviteAndEarn?: () => void;
  onHelp?: () => void;
  onAbout?: () => void;
  onLogout?: () => Promise<void>;
  onDismiss?: () => void;
};

export type SideMenuRef = {
  present: () => void;
  dismiss: () => void;
};

// Menu Item Component
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

// Section Header Component
const SectionHeader = ({ title }: { title: string }) => {
  const { theme } = useUnistyles();

  return (
    <View style={styles.sectionHeader}>
      <Text
        style={{ color: theme.colors.text.subtle }}
        size="sm"
        weight="semibold"
      >
        {title.toUpperCase()}
      </Text>
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

// Theme Toggle Item Component
const ThemeToggleItem = ({
  iconName,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  iconName: string;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) => {
  const { theme } = useUnistyles();
  const activeColor = "rgb(30,67,149)";

  const handleToggle = () => {
    triggerHaptic("light");
    onValueChange(!value);
  };

  return (
    <Pressable
      onPress={handleToggle}
      style={({ pressed }) => [
        styles.menuItem,
        styles.toggleItem,
        pressed && { opacity: 0.7 },
      ]}
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
      <View style={styles.switchContainer}>
        <Switch
          value={value}
          onValueChange={(val) => {
            triggerHaptic("light");
            onValueChange(val);
          }}
          trackColor={{
            false: theme.colors.background.emphasis,
            true: activeColor,
          }}
          thumbColor="#FFFFFF"
        />
      </View>
    </Pressable>
  );
};

// Logout Menu Item Component
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
      onDrafts,
      onNetwork,
      onInviteAndEarn,
      onHelp,
      onAbout,
      onLogout,
      onDismiss,
    },
    ref,
  ) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [showLogoutPopup, setShowLogoutPopup] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    // Auth state
    const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

    // Theme state from preferences store
    const themeMode = usePreferencesStore((s) => s.theme);
    const setTheme = usePreferencesStore((s) => s.setTheme);

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
    }, []);

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
        close();
        setTimeout(() => {
          handler?.();
        }, 300);
      },
      [close],
    );

    // Theme handlers
    const isAutomatic = themeMode === "system";
    const isDarkMode = themeMode === "dark";

    const handleAutomaticToggle = useCallback(
      (enabled: boolean) => {
        if (enabled) {
          setTheme("system");
        } else {
          setTheme("light");
        }
      },
      [setTheme],
    );

    const handleDarkModeToggle = useCallback(
      (enabled: boolean) => {
        if (enabled) {
          setTheme("dark");
        } else {
          setTheme("light");
        }
      },
      [setTheme],
    );

    // Logout handlers
    const handleLogoutPress = useCallback(() => {
      triggerHaptic("light");
      setShowLogoutPopup(true);
    }, []);

    const handleLogoutCancel = useCallback(() => {
      setShowLogoutPopup(false);
    }, []);

    // Auth handlers for logged out state
    const handleCreateAccount = useCallback(() => {
      triggerHaptic("light");
      close();
      setTimeout(() => {
        router.push("/(auth)/username");
      }, 300);
    }, [close, router]);

    const handleLogin = useCallback(() => {
      triggerHaptic("light");
      close();
      setTimeout(() => {
        router.push("/(auth)/login");
      }, 300);
    }, [close, router]);

    const handleLogoutConfirm = useCallback(async () => {
      setIsLoggingOut(true);
      try {
        close();
        await onLogout?.();
      } catch (error) {
        console.error("[SideMenu] Logout failed:", error);
      } finally {
        setIsLoggingOut(false);
        setShowLogoutPopup(false);
      }
    }, [close, onLogout]);

    if (!visible) return null;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.container}>
          {/* Backdrop */}
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
            <Pressable
              style={styles.backdropPressable}
              onPress={handleBackdropPress}
            />
          </Animated.View>

          {/* Menu Panel */}
          <Animated.View
            style={[
              styles.menuPanel,
              { backgroundColor: theme.colors.background.default },
              menuAnimatedStyle,
            ]}
          >
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
              <Text size="xl" weight="bold">
                Menu
              </Text>
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

            {/* Scrollable Menu Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: insets.bottom + 24 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {isLoggedIn ? (
                <>
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
                  <MenuItem
                    iconName="document-text-outline"
                    title="Drafts"
                    subtitle="Unpublished content"
                    onPress={createHandler(onDrafts)}
                  />
                  <SectionFooter />
                  {/* Social Section */}
                  <SectionHeader title="Social" />
                  <MenuItem
                    iconName="globe-outline"
                    title="Network"
                    subtitle="Your connections"
                    onPress={createHandler(onNetwork)}
                  />
                  <MenuItem
                    iconName="gift-outline"
                    title="Invite & Earn"
                    subtitle="Get rewards"
                    onPress={createHandler(onInviteAndEarn)}
                  />
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
                    iconName="card-outline"
                    title="Subscription"
                    subtitle="Manage your plan"
                    onPress={createHandler(onSubscription)}
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

                  {/* Theme Section */}
                  <SectionHeader title="Theme" />
                  <ThemeToggleItem
                    iconName="phone-portrait-outline"
                    title="Automatic"
                    subtitle="Follow system setting"
                    value={isAutomatic}
                    onValueChange={handleAutomaticToggle}
                  />
                  <ThemeToggleItem
                    iconName="moon-outline"
                    title="Dark Mode"
                    value={isDarkMode}
                    onValueChange={handleDarkModeToggle}
                  />
                  <SectionFooter />

                  {/* Account Section */}
                  <SectionHeader title="Account" />
                  <LogoutMenuItem onPress={handleLogoutPress} />
                </>
              ) : (
                <>
                  {/* Logged out state - only show Create Account and Login */}
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
                </>
              )}
            </ScrollView>
          </Animated.View>

          {/* Logout Confirmation Popup */}
          <LogoutConfirmationPopup
            visible={showLogoutPopup}
            onCancel={handleLogoutCancel}
            onConfirm={handleLogoutConfirm}
            isLoading={isLoggingOut}
          />
        </View>
      </Modal>
    );
  },
);

SideMenu.displayName = "SideMenu";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
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
    elevation: 10,
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
}));
