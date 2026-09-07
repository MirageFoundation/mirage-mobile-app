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
    paddingBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: 0.5,
  },
  backButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: theme.spacing.sm,
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
  headerJoinTarget: {
    flexShrink: 0,
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.xs,
  },
  headerJoinButton: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
}));
