import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Box, Button, Checkbox, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore } from "@/src/stores";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function RecoveryPhraseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string }>();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const recoveryPhrase = useAuthStore((s) => s.recoveryPhrase);
  const confirmWalletCreation = useAuthStore((s) => s.confirmWalletCreation);
  const clearRecoveryPhrase = useAuthStore((s) => s.clearRecoveryPhrase);
  const walletAddress = useAuthStore((s) => s.walletAddress);

  const [hasSaved, setHasSaved] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // Parse mnemonic into words array
  const words = useMemo(() => {
    if (!recoveryPhrase) return [];
    return recoveryPhrase.split(" ");
  }, [recoveryPhrase]);

  // Redirect if no recovery phrase (user navigated directly)
  useEffect(() => {
    if (!recoveryPhrase) {
      router.replace("/(auth)/username");
    }
  }, [recoveryPhrase, router]);

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
          onPress: () => {
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

    try {
      // Confirm wallet creation (clears mnemonic from memory, sets logged in)
      await confirmWalletCreation();

      triggerHaptic("success");

      // Navigate to home
      setTimeout(() => {
        router.dismissTo("/(tabs)");
      }, 100);
    } catch (error) {
      console.error("[RecoveryPhrase] Failed to confirm wallet:", error);
      triggerHaptic("error");
      Alert.alert("Error", "Failed to complete wallet setup. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }, [hasSaved, confirmWalletCreation, router]);

  // Don't render if no recovery phrase
  if (words.length === 0) {
    return null;
  }

  return (
    <Box flex background="base">
      {/* Header */}
      <View style={[styles.header, { paddingTop: 20 }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <AntDesign
            name="arrow-left"
            size={24}
            color={theme.colors.text.default}
          />
        </Pressable>
        <View style={styles.headerCenter}>
          <Image
            source={require("@/assets/images/app-icon.png")}
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

        {/* Warning */}
        <View style={styles.warningBox}>
          <Ionicons
            name="warning"
            size={20}
            color={theme.colors.warning[600]}
          />
          <Text size="sm" style={styles.warningText}>
            Write down these 12 words in order and keep them safe. This is the
            only way to recover your account. Never share them with anyone.
          </Text>
        </View>

        {/* Wallet address preview */}
        {walletAddress && (
          <View style={styles.addressBox}>
            <Text size="xs" mode="subtle">
              Your wallet address:
            </Text>
            <Text size="sm" weight="medium" style={{ marginTop: 2 }}>
              {walletAddress.slice(0, 20)}...{walletAddress.slice(-8)}
            </Text>
          </View>
        )}

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
                ? "rgb(242, 242, 242)"
                : theme.colors.primary[500],
          }}
        >
          <Button.Text
            style={{
              color: !hasSaved || isConfirming ? theme.colors.text.subtle : "#fff",
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
