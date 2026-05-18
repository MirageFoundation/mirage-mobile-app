import { PROFILE_TAB_BAR_HEIGHT } from "@/src/components/molecules/profile-tabs";
import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  list: {
    flex: 1,
  },
  inlineTabPlaceholder: {
    height: PROFILE_TAB_BAR_HEIGHT,
    backgroundColor: theme.colors.background.default,
  },
  stickyTabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 99,
  },
  bottomSpacer: {
    height: 80,
  },
}));
