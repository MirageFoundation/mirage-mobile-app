import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
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
