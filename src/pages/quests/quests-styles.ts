import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  content: {
    paddingTop: theme.spacing.lg,
  },
  sectionTitle: {
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
  },
  timerCard: {
    overflow: "hidden",
  },
  timerGlow: {
    position: "absolute",
    top: -50,
    left: "25%",
    width: "50%",
    height: 100,
    borderRadius: 50,
    opacity: 0.1,
  },
  timerGlowLeft: {
    position: "absolute",
    bottom: -30,
    left: -80,
    width: 120,
    height: 120,
    borderRadius: 35,
    opacity: 0.08,
  },
  timerGlowRight: {
    position: "absolute",
    bottom: -30,
    right: -50,
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.08,
  },
  progressBarContainer: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: theme.spacing.sm,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  questCard: {
    overflow: "hidden",
  },
  questIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkBadge: {
    position: "absolute",
    bottom: -3,
    right: -3,
    backgroundColor: "white",
    borderRadius: 8,
  },
  rewardBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  questProgressContainer: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  questProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  claimButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: theme.spacing.md,
  },
  claimAllButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gradientButton: {
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
}));
