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
    gap: 8,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  tab: {
    paddingVertical: 10,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.text.default,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.1)",
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 4,
  },
  amount: {
    fontVariant: ["tabular-nums"],
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: "center",
  },
  targetRow: {
    paddingVertical: 8,
    gap: 2,
  },
  empty: {
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: "center",
  },
}));
