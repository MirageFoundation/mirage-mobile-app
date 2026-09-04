import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  statusBarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background.default,
    zIndex: 101,
  },
  moderationModalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
  },
  moderationModalCard: {
    backgroundColor: theme.colors.background.default,
    overflow: "hidden",
  },
}));
