import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useHomePostCardStore } from "@/src/stores/home-post-card-store";
import { SideMenuContent } from "./side-menu-content";
import {
  MENU_WIDTH,
  SIDE_MENU_ANIMATION_CONFIG,
  styles,
} from "./side-menu-styles";

export type SideMenuRef = {
  present: () => void;
  dismiss: () => void;
  dismissImmediate: () => void;
};

export const SideMenu = forwardRef<SideMenuRef>(function SideMenu(_, ref) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const translateX = useSharedValue(-MENU_WIDTH);
  const backdropOpacity = useSharedValue(0);

  const markDismissed = useCallback(() => {
    setVisible(false);
    useHomePostCardStore.getState().setSideMenuOpen(false);
  }, []);

  const open = useCallback(() => {
    setVisible(true);
    useHomePostCardStore.getState().setSideMenuOpen(true);
    translateX.value = withTiming(0, SIDE_MENU_ANIMATION_CONFIG);
    backdropOpacity.value = withTiming(0.5, SIDE_MENU_ANIMATION_CONFIG);
  }, [backdropOpacity, translateX]);

  const close = useCallback(() => {
    translateX.value = withTiming(-MENU_WIDTH, SIDE_MENU_ANIMATION_CONFIG);
    backdropOpacity.value = withTiming(0, SIDE_MENU_ANIMATION_CONFIG, () => {
      runOnJS(markDismissed)();
    });
  }, [backdropOpacity, markDismissed, translateX]);

  const dismissImmediate = useCallback(() => {
    translateX.value = -MENU_WIDTH;
    backdropOpacity.value = 0;
    markDismissed();
  }, [backdropOpacity, markDismissed, translateX]);

  useImperativeHandle(ref, () => ({ present: open, dismiss: close, dismissImmediate }), [close, dismissImmediate, open]);

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

  if (!visible) return null;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
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
            <Text size="xl" weight="bold">Menu</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={close}
              style={[styles.closeButton, { backgroundColor: theme.colors.background.subtle }]}
            >
              <Ionicons name="close" size={20} color={theme.colors.text.default} />
            </Pressable>
          </View>
          <SideMenuContent visible={visible} close={close} />
        </Animated.View>
      </View>
    </View>
  );
});
