import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0.5,
    gap: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: theme.radius.xxl + 10,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: theme.typography.size.lg,
    fontFamily: theme.typography.family.mono,
    height: "100%",
    backgroundColor: theme.colors.background.lighter,
    borderRadius: theme.radius.xxl + 10,
  },
  clearInputButton: {
    padding: 4,
  },
  clearInputIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  // Tabs
  tabsContainer: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: theme.spacing.sm + 2,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    minWidth: 20,
    alignItems: "center",
  },
  // List content
  listContent: {
    paddingTop: theme.spacing.md,
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderTitle: {
    letterSpacing: 0.5,
  },
  sectionTitle: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.5,
  },
  // Divider
  divider: {
    height: 0.5,
    marginHorizontal: theme.spacing.md,
  },
  // Recent search item
  recentSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  recentSearchLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  clearButton: {
    padding: 4,
  },
  // Trending topic item
  trendingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  trendingIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  trendingContent: {
    flex: 1,
    gap: 2,
  },
  // Topic result item
  topicResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  topicResultIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  topicResultContent: {
    flex: 1,
    gap: 2,
  },
  // Topic header when viewing posts
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  topicBackButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  topicHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  // User result item
  userResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  userResultContent: {
    flex: 1,
    gap: 2,
  },
  userResultNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  agentTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  // Post result item - new design
  postResultItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.md,
  },
  postResultContent: {
    flex: 1,
    gap: 4,
  },
  postResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  postTitle: {
    lineHeight: 20,
  },
  postResultMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  postThumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background.subtle,
  },
  // Empty states
  emptyState: {
    paddingVertical: theme.spacing.xl * 2,
    alignItems: "center",
  },
  emptyTrendingState: {
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  loadingState: {
    paddingVertical: theme.spacing.xl,
    alignItems: "center",
  },
}));
