import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { TransactionProgressModal } from "@/src/components/molecules";
import { Box, Button, Input, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { executeWithProgress, useTransactionProgress } from "@/src/hooks";
import { useDeleteUser } from "@/src/api/write";
import {
  ensureLocallyLoggedOutAfterAccountDeletion,
  useAuthStore,
} from "@/src/stores/auth-store";
import { useToast } from "@/src/providers/toast-provider";
import { useSideMenu } from "@/src/providers/side-menu-provider";
import { AccountDeletionCompletionCoordinator } from "@/src/services/account-deletion-completion";
import { getApiErrorMessage } from "@/src/utils/parse-api-error";

class AccountDeletionRequestError extends Error {}

export function DeleteAccountScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { closeSideMenu } = useSideMenu();

  const [confirmText, setConfirmText] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isConfirmed = confirmText === "DELETE";
  const txProgress = useTransactionProgress();
  const deleteMutation = useDeleteUser({
    onPoWProgress: txProgress.updatePoWProgress,
  });
  const completionCoordinatorRef = useRef<AccountDeletionCompletionCoordinator | null>(null);
  if (!completionCoordinatorRef.current) {
    completionCoordinatorRef.current = new AccountDeletionCompletionCoordinator();
  }

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardWillHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
      completionCoordinatorRef.current?.cancel();
    };
  }, []);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const handleDelete = useCallback(async () => {
    if (!isConfirmed || isSubmitting) return;
    setIsSubmitting(true);
    triggerHaptic("medium");
    const deletedWalletAddress = useAuthStore.getState().walletAddress;

    const result = await completionCoordinatorRef.current!.run({
      requestDeletion: async () => {
        const txResult = await executeWithProgress(
          txProgress,
          () => deleteMutation.mutateAsync(),
        );
        if (!txResult.success) {
          throw new AccountDeletionRequestError(
            txResult.error ?? "Please try again.",
          );
        }
      },
      successDelayMs: 500,
      logout: () => useAuthStore.getState().logout(),
      ensureLoggedOut: () =>
        ensureLocallyLoggedOutAfterAccountDeletion(deletedWalletAddress),
      onCompleted: () => {
        txProgress.hideModal();
        closeSideMenu();
        toast.success("Delete account requested");
        router.replace("/(tabs)");
      },
    });

    if (result.status === "cancelled") return;
    setIsSubmitting(false);

    if (result.status === "request_failed") {
      const err = result.error;
      Sentry.captureException(err, {
        tags: { feature: "delete-account", operation: "delete-account" },
      });
      triggerHaptic("error");
      const responseData = (err as any)?.response?.data;
      const isTransportNetworkError =
        (err as any)?.code === "ERR_NETWORK" ||
        (err as any)?.message === "Network Error";
      const errorMessage = isTransportNetworkError
        ? "No internet connection"
        : responseData
          ? getApiErrorMessage(err)
          : err instanceof Error
            ? err.message
            : "Please try again.";
      toast.error("Failed to delete account", errorMessage);
      return;
    }

    if (result.status === "logout_failed") {
      txProgress.hideModal();
      triggerHaptic("error");
      Sentry.captureException(
        new Error("Account deletion completed but logout cleanup failed"),
        {
          tags: {
            feature: "delete-account",
            operation: "logout-after-deletion",
            fallback: result.fallbackError ? "failed" : "completed",
          },
        },
      );
      toast.error(
        "Account deleted and signed out",
        result.fallbackError
          ? "Restart the app before signing in again."
          : "Some device cleanup failed. Restart the app before signing in again.",
      );
    }
  }, [
    closeSideMenu,
    deleteMutation,
    isConfirmed,
    isSubmitting,
    router,
    toast,
    txProgress,
  ]);

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Delete Account
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.content}>
          <Box
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(255, 59, 48, 0.15)" },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={36}
              color={theme.colors.error[500]}
            />
          </Box>

          <Text
            size="md"
            mode="subtle"
            style={styles.warningText}
          >
            This submits an account deletion request to the network. Most nodes
            will honor it, but some may not — full removal cannot be guaranteed.
          </Text>

          <Input
            size="lg"
            variant="outline"
            placeholder="Type DELETE to confirm"
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View style={[styles.footer, { paddingBottom: keyboardVisible ? 16 : insets.bottom + 16 }]}>
          <View style={styles.buttonWrapper}>
            <Button
              size="lg"
              mode="error"
              rounded="full"
              disabled={!isConfirmed || isSubmitting}
              onPress={handleDelete}
              style={[
                styles.deleteButton,
                isConfirmed && { backgroundColor: theme.colors.error[500] },
              ]}
            >
              <Button.Text>Delete Account</Button.Text>
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Deleting Account"
        onDismiss={txProgress.hideModal}
        showTxHash={false}
        autoDismissDelay={500}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  flex: {
    flex: 1,
  },
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
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 80,
    alignItems: "center",
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  warningText: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: theme.spacing.xl,
  },
  input: {
    width: "100%",
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  buttonWrapper: {
    width: "100%",
  },
  deleteButton: {
    width: "100%",
  },
}));
