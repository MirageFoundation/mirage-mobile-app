import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.md,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareRow: {
    marginHorizontal: -theme.spacing.lg,
  },
  shareRowContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  shareAppButton: {
    alignItems: "center",
    width: 56,
  },
  shareAppIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.xs,
  },
  shareAppLabel: {
    textAlign: "center",
  },
  divider: {
    height: 1,
    marginVertical: theme.spacing.md,
    marginHorizontal: -theme.spacing.lg,
  },
  menuList: {},
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm + 3,
  },
  menuItemIOS: {
    paddingVertical: theme.spacing.sm + 3,
  },
}));
