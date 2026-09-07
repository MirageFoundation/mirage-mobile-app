import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 56,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cancelButtonContainer: {
    marginLeft: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    height: "100%",
    fontWeight: "400",
  },
  clearButton: {
    padding: 6,
  },
  communityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
  },
  communityInfo: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  communityNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  joinButton: {
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: 76,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyImage: {
    width: 180,
    height: 180,
    marginBottom: 16,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
}));
