import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    flex: 1,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  avatarButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerDivider: {
    height: 1,
    backgroundColor: theme.colors.border.subtle,
  },
  divider: {
    height: 5,
    backgroundColor: theme.colors.background.subtle,
  },
  threadReminder: {
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background.subtle,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary[500],
    gap: theme.spacing.sm,
  },
  threadReminderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  threadReminderTitle: {
    flexShrink: 1,
  },
  threadReminderActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
    width: "100%",
  },
  threadReminderButtonSlot: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "50%",
    minWidth: 0,
    maxWidth: "50%",
  },
  threadReminderButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    backgroundColor: theme.colors.background.default,
    minHeight: 36,
  },
  threadReminderButtonPressed: {
    opacity: 0.7,
  },
  threadReminderButtonActive: {
    opacity: 0.6,
  },
  threadReminderButtonDisabled: {
    opacity: 0.5,
    backgroundColor: theme.colors.background.subtle,
  },
  threadReminderLink: {
    color: theme.colors.primary[500],
    textDecorationLine: "underline",
  },
  // Skeleton styles
  skeletonHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonHeaderText: {
    marginLeft: theme.spacing.sm,
    gap: 4,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },
  // Comment skeleton styles
  commentSkeleton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  skeletonActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  // Sticky header styles
  stickyHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
    overflow: "hidden",
  },
  stickyHeaderContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  stickyHeaderInfo: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    justifyContent: "center",
  },
  stickyHeaderTitle: {
    lineHeight: 18,
  },
  stickyHeaderStats: {
    flexDirection: "row",
    alignItems: "center",
    // marginTop: 2,
  },
  stickyHeaderDot: {
    marginHorizontal: theme.spacing.xs,
  },
  stickyHeaderThumbnail: {
    width: 52,
    height: "100%",
    minHeight: 48,
    marginLeft: theme.spacing.sm,
  },
}));
