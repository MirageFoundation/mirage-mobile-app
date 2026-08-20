import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { resetServerScopedCache } from "@/src/api/cache/server-cache";
import { queryKeys } from "@/src/api/read/query-keys";
import type { NodeConfigResponse } from "@/src/api/types";
import { RecoveryPhraseInput } from "@/src/components/molecules";
import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useServerList } from "@/src/hooks/use-server-list";
import { useAuthStore, usePreferencesStore, type ApiServer } from "@/src/stores";
import { apiClient } from "@/src/api/client";
import { useToast } from "@/src/providers/toast-provider";
import { isValidMnemonic } from "@/src/wallet";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { exitAuthModal } from "@/src/navigation/auth-navigation";
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
import { LinearGradient } from "expo-linear-gradient";
import { useQueryClient } from "@tanstack/react-query";

export default function LoginScreen() {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const importWallet = useAuthStore((s) => s.importWallet);
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
  const [showRegPopup, setShowRegPopup] = useState(false);
  const [isSwitchingReg, setIsSwitchingReg] = useState(false);

  const { servers } = useServerList();

  const isComplete = words.every((w) => w.length > 0);
  const [nodeConfigData, setNodeConfigData] = useState<{ registration_enabled: boolean } | null>(null);

  useEffect(() => {
    apiClient.setBaseUrl(`https://${activeServer}`);
    const cachedConfig = queryClient.getQueryData<NodeConfigResponse>(queryKeys.nodeConfig());
    if (cachedConfig) {
      setNodeConfigData(cachedConfig);
      return;
    }
    getNodeConfig()
      .then((config) => setNodeConfigData(config))
      .catch(() => setNodeConfigData(null));
  }, [activeServer, queryClient]);

  useEffect(() => {
    return () => {
      const currentServer = usePreferencesStore.getState().apiServer;
      apiClient.setBaseUrl(`https://${currentServer}`);
    };
  }, []);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
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

      exitAuthModal();
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
            resizeMode="contain"
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
                        resetServerScopedCache(queryClient);
                        await getNodeConfig();
                        setActiveServer(server);
                        setApiServer(server);
                        toast.success(`Switched to ${server}`);
                      } catch {
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

      <Modal
        visible={showRegPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRegPopup(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowRegPopup(false)}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: theme.colors.background.default },
            ]}
          >
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Ionicons
                name="alert-circle-outline"
                size={48}
                color={theme.colors.warning[500]}
              />
            </View>
            <Text
              size="lg"
              weight="bold"
              style={{ textAlign: "center", marginBottom: 10 }}
            >
              Registration Unavailable
            </Text>
            <Text
              size="md"
              style={{
                textAlign: "center",
                color: theme.colors.text.subtle,
                marginBottom: 20,
              }}
            >
              Account creation is not available on{" "}
              <Text size="md" weight="semibold">
                {activeServer}
              </Text>
              . Switch to{" "}
              <Text size="md" weight="semibold">
                {servers.find((s) => s !== activeServer) ?? servers[0]}
              </Text>{" "}
              to create an account.
            </Text>
            <Pressable
              onPress={async () => {
                const target = servers.find((s) => s !== activeServer) ?? servers[0];
                setIsSwitchingReg(true);
                try {
                  apiClient.setBaseUrl(`https://${target}`);
                  resetServerScopedCache(queryClient);
                  const config = await getNodeConfig();
                  setActiveServer(target);
                  setApiServer(target);
                  setNodeConfigData(config);
                  setShowRegPopup(false);
                  toast.success(`Switched to ${target}`);
                  if (config.registration_enabled) {
                    router.replace("/username");
                  }
                } catch {
                  apiClient.setBaseUrl(`https://${activeServer}`);
                  toast.error(`Failed to connect to ${target}`);
                } finally {
                  setIsSwitchingReg(false);
                }
              }}
              disabled={isSwitchingReg}
              style={{ width: "100%", opacity: isSwitchingReg ? 0.7 : 1 }}
            >
              <LinearGradient
                colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                }}
              >
                {isSwitchingReg ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
                    Switch to {servers.find((s) => s !== activeServer) ?? servers[0]}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => setShowRegPopup(false)}
              disabled={isSwitchingReg}
              style={{ alignItems: "center", paddingTop: 12, opacity: isSwitchingReg ? 0.3 : 1 }}
            >
              <Text size="md" style={{ color: theme.colors.text.subtle }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.divider} />
        <Pressable
          onPress={() => {
            triggerHaptic("selection");
            if (nodeConfigData && !nodeConfigData.registration_enabled) {
              setShowRegPopup(true);
              return;
            }
            router.replace("/username");
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
    height: 50,
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
