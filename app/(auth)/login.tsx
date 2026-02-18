import { getUserStatus } from "@/src/api/read/endpoints/users";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { RecoveryPhraseInput } from "@/src/components/molecules";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useServerList } from "@/src/hooks/use-server-list";
import { useAuthStore, useUIStore, usePreferencesStore, type ApiServer } from "@/src/stores";
import { apiClient } from "@/src/api/client";
import { useToast } from "@/src/providers/toast-provider";
import { isValidMnemonic } from "@/src/wallet";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function LoginScreen() {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();

  const importWallet = useAuthStore((s) => s.importWallet);
  const setUserLevel = useAuthStore((s) => s.setUserLevel);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);
  const setUser = useAuthStore((s) => s.setUser);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);
  const toast = useToast();

  const [words, setWords] = useState<string[]>(Array(12).fill(""));
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const savedServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);
  const [activeServer, setActiveServer] = useState<ApiServer>(savedServer);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);

  const { servers } = useServerList();

  const isComplete = words.every((w) => w.length > 0);

  useEffect(() => {
    apiClient.setBaseUrl(`https://${activeServer}`);
    return () => {
      apiClient.setBaseUrl(`https://${savedServer}`);
    };
  }, [activeServer]);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${savedServer}`);
    router.back();
  }, [router, savedServer]);

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

      // Get the wallet address from auth store after import
      const walletAddress = useAuthStore.getState().walletAddress;

      if (walletAddress) {
        try {
          // Fetch user status from API to get username and subscription level
          const userStatus = await getUserStatus({ address: walletAddress });

          // Update auth store with user level
          setUserLevel(userStatus.user_level);

          // Update username info
          if (userStatus.username) {
            setHasUsername(true);
            setUser({
              id: walletAddress,
              username: userStatus.username,
              walletAddress,
              tier:
                ["Free", "Basic", "Premium", "Pro"][userStatus.user_level] ||
                "Free",
            });
          }
        } catch (apiError) {
          // API error shouldn't block login - user can still use the app
          console.warn("[Login] Failed to fetch user status:", apiError);
        }
      }

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
  }, [
    isComplete,
    words,
    validatePhrase,
    importWallet,
    setUserLevel,
    setHasUsername,
    setUser,
    router,
  ]);

  return (
    <Box flex background="base">
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? 20 : insets.top }]}>
        <Pressable onPress={handleBack} style={styles.closeButton}>
          <EvilIcons name="close" size={36} color={theme.colors.text.default} />
        </Pressable>
        <Pressable onPress={() => setShowServerModal(true)}>
          <Text
            size="lg"
            weight="semibold"
            style={{
              color: "#60A5FA",
              textDecorationLine: "underline",
              marginRight: 8,
            }}
          >
            {activeServer}
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      <View style={styles.scrollView}>
        {/* Title section */}
        <View style={styles.titleSection}>
          <Image
            source={
              isDark
                ? require("@/assets/images/app-dark-icon.png")
                : require("@/assets/images/app-icon.png")
            }
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
          gap="sm"
          style={{
            width: "100%",
          }}
        >
          <Button.Text weight="medium">
            {isLoading ? "Logging in..." : "Log in"}
          </Button.Text>
        </Button>
      </View>

      <Modal
        visible={showServerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowServerModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowServerModal(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.background.default },
            ]}
          >
            <Text size="lg" weight="bold" style={{ marginBottom: 16, textAlign: "center" }}>
              Switch Node
            </Text>
            {servers.map((server) => {
              const isActive = server === activeServer;
              const isSwitching = switchingServer === server;
              return (
                <Pressable
                  key={server}
                  disabled={!!switchingServer}
                  onPress={async () => {
                    if (!isActive) {
                      setSwitchingServer(server);
                      try {
                        apiClient.setBaseUrl(`https://${server}`);
                        await getNodeConfig();
                        setActiveServer(server);
                        setApiServer(server);
                        toast.success(`Switched to ${server}`);
                      } catch (e) {
                        apiClient.setBaseUrl(`https://${activeServer}`);
                        toast.error(`Failed to connect to ${server}`);
                      } finally {
                        setSwitchingServer(null);
                      }
                    }
                    setShowServerModal(false);
                  }}
                  style={[
                    styles.modalOption,
                    {
                      backgroundColor: isActive
                        ? `${theme.colors.primary[500]}10`
                        : "transparent",
                      opacity: switchingServer && !isSwitching ? 0.5 : 1,
                    },
                  ]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <Ionicons
                      name={isActive ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={isActive ? theme.colors.primary[500] : theme.colors.text.subtle}
                    />
                    <Text
                      size="md"
                      weight={isActive ? "semibold" : "regular"}
                      style={isActive ? { color: theme.colors.primary[500] } : undefined}
                    >
                      {server}
                    </Text>
                  </View>
                  {isSwitching && (
                    <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
    color: theme.colors.neutral[600],
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
