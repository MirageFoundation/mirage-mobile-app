import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { setUsername } from "@/src/api/write";
import {
  RecoveryPhraseGrid,
  TransactionProgressModal,
} from "@/src/components/molecules";
import { Box, Button, Checkbox, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { executeWithProgress, useTransactionProgress } from "@/src/hooks";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore } from "@/src/stores";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function RecoveryPhraseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string }>();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();

  const recoveryPhrase = useAuthStore((s) => s.recoveryPhrase);
  const confirmWalletCreation = useAuthStore((s) => s.confirmWalletCreation);
  const clearRecoveryPhrase = useAuthStore((s) => s.clearRecoveryPhrase);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);

  const [hasSaved, setHasSaved] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Track if wallet was successfully confirmed (to know if cleanup is needed)
  const walletConfirmedRef = useRef(false);

  // Transaction progress for username registration
  const txProgress = useTransactionProgress();

  // Parse mnemonic into words array
  const words = useMemo(() => {
    if (!recoveryPhrase) return [];
    return recoveryPhrase.split(" ");
  }, [recoveryPhrase]);

  // Redirect if no recovery phrase (user navigated directly)
  // But don't redirect if we're in the middle of confirming
  useEffect(() => {
    if (!recoveryPhrase && !isConfirming) {
      router.dismissTo("/(auth)/username");
    }
  }, [recoveryPhrase, isConfirming, router]);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");

    // Warn user before going back
    Alert.alert(
      "Are you sure?",
      "If you go back, you'll need to create a new wallet. Make sure you've saved your recovery phrase.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Go Back",
          style: "destructive",
          onPress: async () => {
            // Clear the wallet from storage since user is abandoning the flow
            await walletService.clearWallet();
            clearRecoveryPhrase();
            router.back();
          },
        },
      ]
    );
  }, [router, clearRecoveryPhrase]);

  const handleCheckboxChange = useCallback(() => {
    triggerHaptic("selection");
    setHasSaved((prev) => !prev);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!hasSaved) return;

    setIsConfirming(true);
    triggerHaptic("selection");

    console.log("[RecoveryPhrase] Starting continue flow...");
    console.log("[RecoveryPhrase] Username:", params.username);

    try {
      // If we have a username, register it on-chain BEFORE confirming wallet
      if (params.username) {
        console.log("[RecoveryPhrase] Getting wallet for signing...");
        // Get wallet for signing
        const wallet = await walletService.getWallet();

        if (!wallet) {
          throw new Error("Wallet not available");
        }

        console.log("[RecoveryPhrase] Wallet address:", wallet.address);
        console.log(
          "[RecoveryPhrase] Starting username registration with PoW..."
        );

        // Execute username registration with progress tracking
        const result = await executeWithProgress(
          txProgress,
          async (onPoWProgress) => {
            txProgress.setPhase("signing");
            const response = await setUsername(
              wallet,
              { username: params.username! },
              onPoWProgress
            );
            txProgress.setPhase("submitting");
            return response;
          },
          {
            pollTxStatus: true,
            getTxStatus: async (hash) => {
              const status = await getTxStatus({ hash });
              return {
                found: status.found,
                indexed: status.indexed ?? false,
                success: status.success,
                error_details: status.error_details,
              };
            },
          }
        );

        console.log("[RecoveryPhrase] Username registration result:", result);

        if (!result.success) {
          console.log(
            "[RecoveryPhrase] Username registration failed, not confirming wallet"
          );
          // Error is already shown in modal, don't navigate
          // Don't confirm wallet creation if username failed
          setIsConfirming(false);
          return;
        }

        console.log("[RecoveryPhrase] Username registration successful!");
        // Update local state to reflect username was set
        setHasUsername(true);
      }

      console.log("[RecoveryPhrase] Confirming wallet creation...");
      // Now confirm wallet creation (clears mnemonic from memory, sets logged in)
      // Only do this AFTER username is successfully set (or if no username needed)
      await confirmWalletCreation();
      walletConfirmedRef.current = true;
      console.log("[RecoveryPhrase] Wallet confirmed, navigating to home...");

      triggerHaptic("success");

      // Navigate to home (modal will auto-dismiss on success)
      setTimeout(() => {
        txProgress.hideModal();
        router.dismissTo("/(tabs)");
      }, 1500);
    } catch (error) {
      console.error("[RecoveryPhrase] Failed to complete setup:", error);
      console.error(
        "[RecoveryPhrase] Error details:",
        error instanceof Error ? error.message : String(error)
      );
      triggerHaptic("error");

      if (!txProgress.isVisible) {
        // Show error in alert if modal isn't showing
        Alert.alert(
          "Error",
          "Failed to complete wallet setup. Please try again."
        );
      }
    } finally {
      setIsConfirming(false);
    }
  }, [
    hasSaved,
    params.username,
    confirmWalletCreation,
    txProgress,
    setHasUsername,
    router,
  ]);

  // Handle retry after error
  const handleRetry = useCallback(() => {
    txProgress.reset();
    // Re-trigger the continue flow
    setTimeout(() => {
      handleContinue();
    }, 100);
  }, [txProgress, handleContinue]);

  // Handle dismiss after error - clean up wallet since flow failed
  const handleDismissError = useCallback(async () => {
    txProgress.hideModal();
    // If wallet wasn't confirmed, clean it up so user can start fresh
    if (!walletConfirmedRef.current) {
      await walletService.clearWallet();
      clearRecoveryPhrase();
      router.back();
    }
  }, [txProgress, clearRecoveryPhrase, router]);

  // Don't render if no recovery phrase
  if (words.length === 0) {
    return null;
  }

  return (
    <Box flex background="base">
      {/* Transaction Progress Modal */}
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Setting Up Account"
        description={`Registering @${params.username} on the blockchain`}
        onDismiss={
          txProgress.progress.phase === "success"
            ? () => {
                txProgress.hideModal();
                router.dismissTo("/(tabs)");
              }
            : handleDismissError
        }
        onRetry={handleRetry}
        dismissible={
          txProgress.progress.phase === "success" ||
          txProgress.progress.phase === "error"
        }
      />
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? 20 : insets.top }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <AntDesign
            name="arrow-left"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Image
            source={
              isDark
                ? require("@/assets/images/app-dark-icon.png")
                : require("@/assets/images/app-icon.png")
            }
            style={styles.appIcon}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title section */}
        <View style={styles.titleSection}>
          <View style={styles.lockIcon}>
            <Ionicons
              name="shield-checkmark"
              size={32}
              color={theme.colors.brand[500]}
            />
          </View>
          <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
            Save Your Recovery Phrase
          </Text>
          {params.username && (
            <Text size="sm" mode="subtle" style={{ marginTop: 4 }}>
              @{params.username}
            </Text>
          )}
        </View>

        {/* Recovery phrase grid */}
        <View style={styles.phraseContainer}>
          <RecoveryPhraseGrid
            words={words}
            masked={false}
            showCopyButton={true}
          />
        </View>

        {/* Checkbox confirmation */}
        <Pressable onPress={handleCheckboxChange} style={styles.checkboxRow}>
          <Checkbox
            checked={hasSaved}
            onChange={handleCheckboxChange}
            size="sm"
          />
          <Text
            size="sm"
            style={{ flex: 1, marginLeft: 8, color: theme.colors.text.subtle }}
          >
            I have saved my recovery phrase securely and understand I cannot
            recover my account without it
          </Text>
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="full"
          onPress={handleContinue}
          disabled={!hasSaved || isConfirming}
          loading={isConfirming}
          style={{
            width: "100%",
            backgroundColor:
              !hasSaved || isConfirming
                ? theme.colors.background.subtle
                : theme.colors.primary[500],
          }}
        >
          <Button.Text
            style={{
              color:
                !hasSaved || isConfirming
                  ? theme.colors.text.subtle
                  : theme.colors.background.default,
            }}
            weight="medium"
          >
            {isConfirming ? "Setting up..." : "Continue to Mirage"}
          </Button.Text>
        </Button>
      </View>
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appIcon: {
    width: 28,
    height: 28,
  },
  headerRight: {
    width: 44,
    height: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${theme.colors.brand[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  warningBox: {
    flexDirection: "row",
    backgroundColor: `${theme.colors.warning[500]}15`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  warningText: {
    flex: 1,
    color: theme.colors.warning[700],
    lineHeight: 20,
  },
  addressBox: {
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: "center",
  },
  phraseContainer: {
    marginBottom: theme.spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
}));
