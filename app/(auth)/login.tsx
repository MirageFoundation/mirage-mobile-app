import { useState, useCallback } from "react";
import { View, Pressable, ScrollView, Keyboard } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Box, Text, Button } from "@/src/components/ui/primitives";
import { RecoveryPhraseInput } from "@/src/components/molecules";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/src/stores";

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const setUser = useAuthStore((s) => s.setUser);
  const setRecoveryPhrase = useAuthStore((s) => s.setRecoveryPhrase);

  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isComplete = words.every((w) => w.length > 0);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    router.back();
  }, [router]);

  const handleWordsChange = useCallback((newWords: string[]) => {
    setWords(newWords);
    setLoginError(null);
    setErrors({});
  }, []);

  const handleComplete = useCallback(() => {
    // Auto-submit when all words are filled
    Keyboard.dismiss();
  }, []);

  const validatePhrase = useCallback(() => {
    // In a real app, validate against BIP-39 word list
    // For now, just check that all words are at least 3 chars
    const newErrors: Record<number, boolean> = {};
    let hasError = false;

    words.forEach((word, index) => {
      if (word.length < 3) {
        newErrors[index] = true;
        hasError = true;
      }
    });

    setErrors(newErrors);
    return !hasError;
  }, [words]);

  const handleLogin = useCallback(async () => {
    if (!isComplete) return;

    if (!validatePhrase()) {
      triggerHaptic("error");
      setLoginError("Some words appear to be invalid");
      return;
    }

    setIsLoading(true);
    triggerHaptic("selection");
    Keyboard.dismiss();

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock: Check if phrase is "valid" (for demo, any 12 valid words work)
    const phrase = words.join(" ");

    // Simulate successful login
    triggerHaptic("success");

    // Store auth state
    setRecoveryPhrase(phrase);
    setUser({
      id: "user_" + Date.now(),
      username: "recovered_user",
      walletAddress: "0x" + Math.random().toString(16).slice(2, 10) + "...",
      tier: "Standard",
    });

    setIsLoading(false);

    // Navigate back to app
    router.dismissAll();
  }, [isComplete, words, validatePhrase, setUser, setRecoveryPhrase, router]);

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="semibold">
          Login
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title section */}
        <View style={styles.titleSection}>
          <View style={styles.keyIcon}>
            <Ionicons
              name="key"
              size={40}
              color={theme.colors.brand[500]}
            />
          </View>
          <Text size="xxl" weight="bold" style={{ textAlign: "center" }}>
            Enter Recovery Phrase
          </Text>
          <Text
            size="sm"
            mode="subtle"
            style={{ marginTop: 8, textAlign: "center" }}
          >
            Enter your 12-word recovery phrase to restore your account
          </Text>
        </View>

        {/* Recovery phrase input */}
        <View style={styles.inputContainer}>
          <RecoveryPhraseInput
            words={words}
            onWordsChange={handleWordsChange}
            errors={errors}
            onComplete={handleComplete}
          />
        </View>

        {/* Error message */}
        {loginError && (
          <View style={styles.errorContainer}>
            <Ionicons
              name="alert-circle"
              size={18}
              color={theme.colors.error[500]}
            />
            <Text
              size="sm"
              style={{ color: theme.colors.error[500], marginLeft: 8 }}
            >
              {loginError}
            </Text>
          </View>
        )}

        {/* Help section */}
        <View style={styles.helpSection}>
          <Text size="sm" weight="semibold" style={{ marginBottom: 8 }}>
            Need Help?
          </Text>
          <Text size="xs" mode="subtle">
            • Make sure you're entering the words in the correct order
          </Text>
          <Text size="xs" mode="subtle" style={{ marginTop: 4 }}>
            • Words should be from the BIP-39 word list
          </Text>
          <Text size="xs" mode="subtle" style={{ marginTop: 4 }}>
            • Check for typos in each word
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="lg"
          onPress={handleLogin}
          disabled={!isComplete || isLoading}
          loading={isLoading}
          style={{ width: "100%" }}
        >
          <Button.Text weight="semibold">
            {isLoading ? "Restoring Account..." : "Restore Account"}
          </Button.Text>
          {!isLoading && (
            <Button.Icon>
              {({ color, size }) => (
                <Ionicons name="arrow-forward" size={size} color={color} />
              )}
            </Button.Icon>
          )}
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
  keyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.brand[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${theme.colors.error[500]}15`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  helpSection: {
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
}));
