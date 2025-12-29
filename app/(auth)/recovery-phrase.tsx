import { useState, useCallback, useMemo } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Box, Text, Button, Checkbox } from "@/src/components/ui/primitives";
import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/src/stores";

// BIP-39 word list sample (in production, use a proper library)
const SAMPLE_WORDS = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
  "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
  "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual",
  "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance",
  "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
  "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album",
];

// Generate random 12-word phrase (mock - use proper crypto in production)
const generateMockPhrase = (): string[] => {
  const words: string[] = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * SAMPLE_WORDS.length);
    words.push(SAMPLE_WORDS[randomIndex]);
  }
  return words;
};

export default function RecoveryPhraseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string }>();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const setRecoveryPhrase = useAuthStore((s) => s.setRecoveryPhrase);

  // Generate phrase on mount
  const words = useMemo(() => generateMockPhrase(), []);

  const [hasSaved, setHasSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    router.back();
  }, [router]);

  const handleCopy = useCallback(() => {
    setCopied(true);
  }, []);

  const handleCheckboxChange = useCallback(() => {
    triggerHaptic("selection");
    setHasSaved((prev) => !prev);
  }, []);

  const handleContinue = useCallback(() => {
    if (!hasSaved) return;

    triggerHaptic("success");

    // Store the recovery phrase
    const phrase = words.join(" ");
    setRecoveryPhrase(phrase);

    // In a real app, this would trigger the onboarding progress
    // For now, just go back to home (simulating account creation)
    router.dismissAll();

    // Show success message or navigate to onboarding progress
    // router.push("/(auth)/onboarding-progress");
  }, [hasSaved, words, setRecoveryPhrase, router]);

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="semibold">
          Recovery Phrase
        </Text>
        <View style={styles.headerSpacer} />
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
              size={40}
              color={theme.colors.brand[500]}
            />
          </View>
          <Text size="xxl" weight="bold" style={{ textAlign: "center" }}>
            Save Your Recovery Phrase
          </Text>
          {params.username && (
            <Text size="sm" mode="subtle" style={{ marginTop: 4 }}>
              Creating account: @{params.username}
            </Text>
          )}
        </View>

        {/* Recovery phrase grid */}
        <View style={styles.phraseContainer}>
          <RecoveryPhraseGrid
            words={words}
            masked={false}
            showCopyButton={true}
            onCopy={handleCopy}
          />
        </View>

        {/* Checkbox confirmation */}
        <Pressable onPress={handleCheckboxChange} style={styles.checkboxRow}>
          <Checkbox
            checked={hasSaved}
            onChange={handleCheckboxChange}
            size="md"
          />
          <Text size="sm" style={{ flex: 1, marginLeft: 12 }}>
            I have saved my recovery phrase securely
          </Text>
        </Pressable>

        {/* Security tips */}
        <View style={styles.tips}>
          <Text size="sm" weight="semibold" style={{ marginBottom: 8 }}>
            Security Tips
          </Text>
          <View style={styles.tipRow}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={theme.colors.success[500]}
            />
            <Text size="xs" mode="subtle" style={{ marginLeft: 8, flex: 1 }}>
              Write it down on paper and store in a safe place
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={theme.colors.success[500]}
            />
            <Text size="xs" mode="subtle" style={{ marginLeft: 8, flex: 1 }}>
              Never share your recovery phrase with anyone
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons
              name="close-circle"
              size={16}
              color={theme.colors.error[500]}
            />
            <Text size="xs" mode="subtle" style={{ marginLeft: 8, flex: 1 }}>
              Don't store it in plain text on your device
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="lg"
          onPress={handleContinue}
          disabled={!hasSaved}
          style={{ width: "100%" }}
        >
          <Button.Text weight="semibold">Create Account</Button.Text>
          <Button.Icon>
            {({ color, size }) => (
              <Ionicons name="arrow-forward" size={size} color={color} />
            )}
          </Button.Icon>
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
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.brand[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  phraseContainer: {
    marginBottom: theme.spacing.lg,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  tips: {
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
}));
