import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme, rt) => ({
  container: {
    width: "100%",
  },
  profileAvatar: {
    backgroundColor:
      rt.themeName === "light" ? "#FFFFFF" : theme.colors.background.subtle,
    borderWidth: 0.5,
    borderColor: theme.colors.border.default,
  },
  headerBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerRow: {
    justifyContent: "space-between",
  },
  gradientContent: {
    width: "100%",
    paddingBottom: theme.spacing.lg,
  },
  profileContentInner: {},
  iconButton: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: theme.radius.full,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  followButton: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  followButtonText: {
    color: "#FFFFFF",
  },
  refreshIndicator: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  usernameContainer: {
    paddingHorizontal: theme.spacing.sm,
    alignItems: "flex-start",
  },
  usernameSkeleton: {
    width: 80,
    height: 18,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  usernameContentSkeleton: {
    width: 120,
    height: 24,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  whiteText: {
    color: "#FFFFFF",
  },
  tierBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  subtleWhiteText: {
    color: "rgba(255,255,255,0.7)",
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginHorizontal: theme.spacing.xs,
  },
  walletAnimatedContainer: {
    alignSelf: "flex-start",
    marginTop: theme.spacing.sm,
  },
  walletPill: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  walletPillCopied: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  walletAddress: {
    color: "rgba(255,255,255,0.7)",
    fontFamily: "monospace",
  },
  walletAddressCopied: {
    color: "#10B981",
  },
  statsContainer: {
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "space-around",
  },
  statLabel: {
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  statDivider: {
    height: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0,
    width: 1,
  },
  statSkeleton: {
    width: 48,
    height: 22,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tierHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
}));
