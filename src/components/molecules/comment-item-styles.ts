import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme, rt) => ({
  container: {
    /* paddingTop / paddingLeft are applied inline since they are
       depth- and collapse-state-dependent. paddingRight gives the
       right gutter for action buttons; paddingBottom matches the
       web mobile rhythm (0.6rem ≈ 10px expanded, 0.4rem ≈ 7px
       collapsed — we use a single value here for simplicity). */
    position: "relative",
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.sm + 2,
  },
  contentWrapper: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  /* Pull the avatar back into the gutter so its left edge lands at
     `commentAvatarLeftPx` (= the column the J-curve elbow terminates
     at). The negative margin equals AVATAR + GAP so the username
     text starts at the same x as the body content below. */
  avatarWrapper: {
    width: COMMENT_AVATAR_SIZE,
    height: COMMENT_AVATAR_SIZE,
    marginLeft: -(COMMENT_AVATAR_SIZE + COMMENT_CONTENT_GAP),
    marginRight: COMMENT_CONTENT_GAP,
    flexShrink: 0,
    alignSelf: "center",
    zIndex: 2,
  },
  commentAvatarContainer: {
    backgroundColor:
      rt.themeName === "light" ? "#FFFFFF" : theme.colors.background.subtle,
  },
  authorSection: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  authorInfo: {
    flexShrink: 0,
  },
  authorInfoCollapsed: {
    flex: 1,
    minWidth: 0,
  },
  usernameButton: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    flexShrink: 0,
  },
  usernameButtonPressed: {
    opacity: 0.6,
  },
  expandArea: {
    flex: 1,
    height: 32,
  },
  expandAreaCollapsed: {
    flex: 0,
    width: theme.spacing.xs,
  },
  followButtonWrapper: {
    justifyContent: "center",
  },
  collapsedPreview: {
    flex: 1,
    minWidth: 0,
    marginLeft: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  authorSectionCollapsed: {
    flex: 1,
    flexShrink: 1,
  },
  authorRowCollapsed: {
    flex: 1,
    minWidth: 0,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: theme.spacing.xs,
  },
  content: {
    marginTop: theme.spacing.xs,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md + 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actionText: {
    marginLeft: 5,
  },
  voteGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  awardBadgesRow: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
}));
