import { RecoveryPhraseInput } from "@/src/components/molecules";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore, useUIStore } from "@/src/stores";
import { isValidMnemonic } from "@/src/wallet";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Keyboard, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const importWallet = useAuthStore((s) => s.importWallet);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isComplete = words.every((w) => w.length > 0);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    router.back();
    // Show auth sheet after going back
    setTimeout(() => {
      showAuthSheet();
    }, 100);
  }, [router, showAuthSheet]);

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
    const phrase = words.join(" ").trim().toLowerCase();

    // Validate using BIP39
    if (!isValidMnemonic(phrase)) {
      // Try to identify which words are invalid
      const newErrors: Record<number, boolean> = {};

      // Mark words that are too short as potentially invalid
      words.forEach((word, index) => {
        if (word.length < 3) {
          newErrors[index] = true;
        }
      });

      // If no specific errors found, mark all as potentially wrong
      if (Object.keys(newErrors).length === 0) {
        words.forEach((_, index) => {
          newErrors[index] = true;
        });
      }

      setErrors(newErrors);
      return false;
    }

    return true;
  }, [words]);

  const handleLogin = useCallback(async () => {
    if (!isComplete) return;

    const phrase = words.join(" ").trim().toLowerCase();

    if (!validatePhrase()) {
      triggerHaptic("error");
      setLoginError("Invalid recovery phrase. Please check your words.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("selection");
    Keyboard.dismiss();

    try {
      // Import the wallet using the mnemonic
      await importWallet(phrase);

      triggerHaptic("success");

      // Navigate to home
      router.dismissAll();
    } catch (error) {
      console.error("[Login] Failed to import wallet:", error);
      triggerHaptic("error");

      if (error instanceof Error) {
        if (error.message.includes("Invalid mnemonic")) {
          setLoginError("Invalid recovery phrase. Please check your words.");
        } else if (error.message.includes("already exists")) {
          setLoginError("A wallet already exists. Please logout first.");
        } else {
          setLoginError("Failed to import wallet. Please try again.");
        }
      } else {
        setLoginError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isComplete, words, validatePhrase, importWallet, router]);

  return (
    <Box flex background="base">
      {/* Header */}
      <View style={[styles.header, { paddingTop: 20 }]}>
        <Pressable onPress={handleBack} style={styles.closeButton}>
          <EvilIcons name="close" size={36} color={theme.colors.text.default} />
        </Pressable>
      </View>

      {/* Content */}
      <View style={styles.scrollView}>
        {/* Title section */}
        <View style={styles.titleSection}>
          <Image
            source={require("@/assets/images/app-icon.png")}
            style={styles.appIcon}
          />
          <Text style={styles.titleText}>Login to Mirage</Text>
          <Text style={styles.subtitleText}>
            Sign in to your existing Mirage account with your 12-word recovery
            phrase:
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

        {/* Login Button */}
        <Button
          size="lg"
          rounded="full"
          onPress={handleLogin}
          disabled={!isComplete || isLoading}
          loading={isLoading}
          style={{
            width: "100%",
            backgroundColor:
              !isComplete || isLoading
                ? "rgb(242, 242, 242)"
                : theme.colors.primary[500],
          }}
        >
          <Button.Text
            style={{
              color:
                !isComplete || isLoading ? theme.colors.text.subtle : "#fff",
            }}
            weight="medium"
          >
            {isLoading ? "Logging in..." : "Log in"}
          </Button.Text>
        </Button>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.divider} />
        <Pressable
          onPress={() => {
            triggerHaptic("selection");
            router.replace("/(auth)/username");
          }}
          style={styles.createAccountButton}
        >
          <Text style={styles.createAccountText}>Create a new account</Text>
        </Pressable>
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
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 44,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "center",
  },
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  appIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    marginBottom: theme.spacing.md,
  },
  titleText: {
    textAlign: "center",
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitleText: {
    textAlign: "center",
    marginVertical: theme.spacing.md,
    fontSize: theme.typography.size.md,
    color: "rgb(100,100,100)",
  },
  inputContainer: {
    marginBottom: theme.spacing.sm,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border.subtle,
    width: "100%",
  },
  createAccountButton: {
    paddingTop: theme.spacing.md,
  },
  createAccountText: {
    color: "rgb(34,74,154)",
    fontSize: 13,
    fontWeight: "500",
  },
}));
