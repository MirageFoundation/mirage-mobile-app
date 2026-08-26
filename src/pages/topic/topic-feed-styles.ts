import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: theme.spacing.sm,
  },
  headerTitleMenu: {
    flex: 1,
  },
  titleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  menuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  headerFollowButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: 12,
    borderWidth: 1,
    marginRight: theme.spacing.xs,
  },
}));
