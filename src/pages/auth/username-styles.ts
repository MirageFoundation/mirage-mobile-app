import { StyleSheet } from "react-native-unistyles";

export const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  appIcon: {
    width: 44,
    height: 50,
  },
  titleContainer: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  titleText: {
    textAlign: "center",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitle: {
    textAlign: "center",
    marginVertical: theme.spacing.lg,
    fontSize: 16,
    color: theme.colors.neutral[600],
    paddingHorizontal: theme.spacing.lg,
  },
  inputWrapper: {
    marginBottom: theme.spacing.xs,
  },
  inviteInputWrapper: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  input: {
    paddingLeft: 12,
  },
  statusIcon: {
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background.subtle,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statusContainer: {
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 8,
    minHeight: 20,
  },
  continueButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  termsText: {
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: theme.spacing.sm,
    fontSize: 13,
    color: theme.colors.text.subtle,
  },
  termsLink: {
    color: theme.colors.text.default,
    textDecorationLine: "underline",
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  loginLink: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  loginText: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "75%",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
}));
