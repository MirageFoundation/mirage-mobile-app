import { Dimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const PREVIEW_WIDTH = 180;
const PREVIEW_HEIGHT = 140;

export const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background.default,
  },
  screen: {
    flex: 1,
  },
  fullscreenLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.sm,
    height: 52,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
  },
  postButton: {
    paddingHorizontal: theme.spacing.md + 4,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
  },
  replyBanner: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  postPreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  postPreviewInfo: {
    flex: 1,
    maxHeight: Dimensions.get("window").height * 0.2,
  },
  postPreviewInfoContent: {
    gap: 2,
  },
  postPreviewBody: {
    marginTop: theme.spacing.xs,
  },
  postPreviewThumbnail: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.sm,
  },
  contentArea: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    flexGrow: 1,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
    paddingVertical: theme.spacing.xs,
  },
  linkContainer: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  linkInput: {
    fontSize: 18,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
  },
  linkNameInput: {
    fontSize: 20,
    fontWeight: "600",
  },
  linkErrorContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
    borderRadius: theme.radius.md,
  },
  addLinkButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm + 4,
    borderRadius: theme.radius.full,
  },
  addedLinksContainer: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  addedLinkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs,
  },
  previewContainer: {
    marginBottom: theme.spacing.sm,
  },
  previewWrapper: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    position: "relative",
    backgroundColor: theme.colors.background.subtle,
  },
  previewImage: {
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadedBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  uploadedBadgeText: {
    color: "#fff",
    marginLeft: 4,
  },
  uploadWarningBadge: {
    backgroundColor: "rgba(234,179,8,0.85)",
  },
  uploadErrorBadge: {
    backgroundColor: "rgba(220,50,50,0.85)",
  },
  removeButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
  },
  toolbarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  toolbarButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  gifSection: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  gifDivider: {
    height: 1,
    marginHorizontal: -theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  gifSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  gifSearchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  gifSearchIcon: {
    marginRight: theme.spacing.xs,
  },
  gifSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: theme.spacing.sm,
  },
  gifCloseButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  giphyAttribution: {
    marginBottom: theme.spacing.xs,
  },
  gifScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    minHeight: 100,
  },
  gifEmptyState: {
    width: 200,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  gifItem: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  gifItemSelected: {
    borderColor: theme.colors.brand[500],
  },
  gifImage: {
    width: "100%",
    height: "100%",
  },
}));
