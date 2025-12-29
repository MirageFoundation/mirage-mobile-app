import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Box, Button, Checkbox, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore } from "@/src/stores";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// BIP-39 word list sample (in production, use a proper library)
const SAMPLE_WORDS = [
  "abandon",
  "ability",
  "able",
  "about",
  "above",
  "absent",
  "absorb",
  "abstract",
  "absurd",
  "abuse",
  "access",
  "accident",
  "account",
  "accuse",
  "achieve",
  "acid",
  "acoustic",
  "acquire",
  "across",
  "act",
  "action",
  "actor",
  "actress",
  "actual",
  "adapt",
  "add",
  "addict",
  "address",
  "adjust",
  "admit",
  "adult",
  "advance",
  "advice",
  "aerobic",
  "affair",
  "afford",
  "afraid",
  "again",
  "age",
  "agent",
  "agree",
  "ahead",
  "aim",
  "air",
  "airport",
  "aisle",
  "alarm",
  "album",
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

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    router.back();
  }, [router]);

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
            I have saved my recovery phrase securely
          </Text>
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="full"
          onPress={handleContinue}
          disabled={!hasSaved}
          style={{ width: "100%" }}
        >
          <Button.Text weight="semibold">Continue to Mirage</Button.Text>
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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
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
  phraseContainer: {
    marginBottom: theme.spacing.lg,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
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
