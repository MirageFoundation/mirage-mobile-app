import { useConfig, useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { queryKeys } from "@/src/api/read/query-keys";
import { useUsernameAvailability } from "@/src/api/read/hooks/use-username-resolution";
import { validateInviteCode } from "@/src/api/read/endpoints/users";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { setUsername as setUsernameOnChain } from "@/src/api/write";
import { TransactionProgressModal } from "@/src/components/molecules";
import {
  Box,
  Button,
  Divider,
  Input,
  Text,
} from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { executeWithProgress, useTransactionProgress, useServerList } from "@/src/hooks";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore, useUIStore, type ApiServer } from "@/src/stores";
import { apiClient } from "@/src/api/client";
import { usePreferencesStore } from "@/src/stores";
import { useToast } from "@/src/providers/toast-provider";
import { useQueryClient } from "@tanstack/react-query";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";
type InviteCodeStatus =
  | "idle"
  | "checking"
  | "valid"
  | "invalid"
  | "used"
  | "expired";

export default function UsernameScreen() {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const createNewWallet = useAuthStore((s) => s.createNewWallet);
  const isCreatingWallet = useAuthStore((s) => s.isCreatingWallet);
  const setHasUsername = useAuthStore((s) => s.setHasUsername);
  const clearRecoveryPhrase = useAuthStore((s) => s.clearRecoveryPhrase);

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<InviteCodeStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const savedServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);
  const [activeServer, setActiveServer] = useState<ApiServer>(savedServer);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);
  const toast = useToast();
  const { servers } = useServerList();

  const walletConfirmedRef = useRef(false);
  const txProgress = useTransactionProgress();

  useEffect(() => {
    console.log("[UsernameScreen] activeServer:", activeServer, "savedServer:", savedServer);
    apiClient.setBaseUrl(`https://${activeServer}`);
  }, [activeServer]);

  useEffect(() => {
    return () => {
      const currentServer = usePreferencesStore.getState().apiServer;
      apiClient.setBaseUrl(`https://${currentServer}`);
    };
  }, []);

  const { data: config } = useConfig();
  const { data: nodeConfig } = useNodeConfig();
  const inviteCodeRequired = nodeConfig?.registration_invite_code_required ?? true;
  const minUsernameSize = config?.min_username_size ?? 3;
  const maxUsernameSize = config?.max_username_size ?? 20;

  const {
    data: usernameData,
    isLoading: isCheckingUsername,
    isFetched,
  } = useUsernameAvailability(
    username.length >= minUsernameSize ? username : null,
  );

  const validateUsername = useCallback(
    (value: string) => {
      if (value.length < minUsernameSize || value.length > maxUsernameSize) {
        return false;
      }
      const isValid = /^[a-zA-Z0-9-]+$/.test(value);
      return isValid;
    },
    [minUsernameSize, maxUsernameSize],
  );

  useEffect(() => {
    if (username.length === 0) {
      setStatus("idle");
      return;
    }

    if (!validateUsername(username)) {
      setStatus("invalid");
      return;
    }

    if (isCheckingUsername) {
      setStatus("checking");
      return;
    }

    if (isFetched && usernameData) {
      if (usernameData.exists) {
        setStatus("taken");
      } else {
        setStatus("available");
      }
    }
  }, [username, validateUsername, isCheckingUsername, isFetched, usernameData]);

  const handleUsernameChange = useCallback((text: string) => {
    const sanitized = text.replace(/[^a-zA-Z0-9-]/g, "");
    setUsername(sanitized);
    setCreateError(null);
  }, []);

  const handleInviteCodeChange = useCallback((text: string) => {
    const raw = text.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length > 4) {
      setInviteCode(raw.slice(0, 4) + "-" + raw.slice(4));
    } else {
      setInviteCode(raw);
    }
    setInviteStatus("idle");
    setCreateError(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (status !== "available") return;
    if (inviteCodeRequired && !inviteCode.trim()) {
      setInviteStatus("invalid");
      setCreateError("Please enter an invite code");
      triggerHaptic("error");
      return;
    }

    triggerHaptic("selection");
    Keyboard.dismiss();

    setInviteStatus("checking");

    try {
      if (inviteCodeRequired) {
        const rawCode = inviteCode.trim();
        console.log("[InviteCode] raw input:", JSON.stringify(inviteCode), "code:", JSON.stringify(rawCode), "length:", rawCode.length);
        const result = await validateInviteCode({ code: rawCode });
        console.log("[InviteCode] validateInviteCode result:", JSON.stringify(result));

        if (!result.valid) {
          if (result.error === "already_used") {
            setInviteStatus("used");
          } else if (result.error === "expired") {
            setInviteStatus("expired");
          } else {
            setInviteStatus("invalid");
          }
          triggerHaptic("error");
          return;
        }
        setInviteStatus("valid");
      }

      setIsSettingUp(true);

      const mnemonic = await createNewWallet();

      if (!mnemonic) {
        throw new Error("Failed to generate wallet");
      }

      const wallet = await walletService.getWallet();

      if (!wallet) {
        throw new Error("Wallet not available");
      }

      const txResult = await executeWithProgress(
        txProgress,
        async (onPoWProgress) => {
          txProgress.setPhase("signing");
          const usernamePayload = { username, ...(inviteCodeRequired && inviteCode.trim() ? { invite_code: inviteCode.trim() } : {}) };
          console.log("[InviteCode] setUsername payload:", JSON.stringify(usernamePayload));
          const response = await setUsernameOnChain(
            wallet,
            usernamePayload,
            onPoWProgress,
          );
          txProgress.setPhase("submitting");
          return response;
        },
        {
          pollTxStatus: true,
          getTxStatus: async (hash) => {
            const s = await getTxStatus({ hash });
            return {
              found: s.found,
              indexed: s.indexed ?? false,
              success: s.success,
              error_details: s.error_details,
            };
          },
        },
      );

      if (!txResult.success) {
        setIsSettingUp(false);
        return;
      }

      setHasUsername(true, username);

      triggerHaptic("success");

      setTimeout(() => {
        txProgress.hideModal();
        router.replace({
          pathname: "/(auth)/recovery-phrase",
          params: { username },
        });
      }, 1500);
    } catch (error) {
      console.error("[Username] Failed to create account:", error);
      triggerHaptic("error");
      setIsSettingUp(false);

      if (!txProgress.isVisible) {
        if (error instanceof Error) {
          if (error.message.includes("already exists")) {
            setCreateError("A wallet already exists. Please logout first.");
          } else {
            setCreateError("Failed to create account. Please try again.");
          }
        } else {
          setCreateError("An unexpected error occurred.");
        }
      }
    }
  }, [
    status,
    username,
    inviteCode,
    inviteCodeRequired,
    createNewWallet,
    setHasUsername,
    txProgress,
    router,
  ]);

  const handleRetry = useCallback(() => {
    txProgress.reset();
    setTimeout(() => {
      handleContinue();
    }, 100);
  }, [txProgress, handleContinue]);

  const handleDismissError = useCallback(async () => {
    txProgress.hideModal();
    setIsSettingUp(false);
    if (!walletConfirmedRef.current) {
      await walletService.clearWallet();
      clearRecoveryPhrase();
    }
  }, [txProgress, clearRecoveryPhrase]);

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.back();
  }, [router]);

  const handleLogin = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.replace("/(auth)/login");
  }, [router]);

  const getStatusIcon = () => {
    switch (status) {
      case "checking":
        return (
          <ActivityIndicator size="small" color={theme.colors.text.subtle} />
        );
      case "available":
        return <Ionicons name="checkmark" size={20} color="rgb(34,197,94)" />;
      case "taken":
        return (
          <Ionicons
            name="close-circle"
            size={20}
            color={theme.colors.error[500]}
          />
        );
      case "invalid":
        return (
          <Ionicons
            name="alert-circle"
            size={20}
            color={theme.colors.warning[500]}
          />
        );
      default:
        return null;
    }
  };

  const getInviteStatusIcon = () => {
    switch (inviteStatus) {
      case "checking":
        return (
          <ActivityIndicator size="small" color={theme.colors.text.subtle} />
        );
      case "valid":
        return <Ionicons name="checkmark" size={20} color="rgb(34,197,94)" />;
      case "used":
      case "expired":
      case "invalid":
        return (
          <Ionicons
            name="close-circle"
            size={20}
            color={theme.colors.error[500]}
          />
        );
      default:
        return null;
    }
  };

  const getStatusMessage = useMemo(() => {
    switch (status) {
      case "checking":
        return "Checking availability...";
      case "available":
        return "Great name! It's not taken, so it's all yours.";
      case "taken":
        return "This username is already taken";
      case "invalid":
        return `${minUsernameSize}-${maxUsernameSize} characters, letters, numbers, hyphens only`;
      default:
        return "";
    }
  }, [status, minUsernameSize, maxUsernameSize]);

  const getInviteStatusMessage = useMemo(() => {
    switch (inviteStatus) {
      case "checking":
        return "Validating invite code...";
      case "valid":
        return "Invite code accepted!";
      case "used":
        return "This invite code has already been used";
      case "expired":
        return "This invite code has expired";
      case "invalid":
        return "Invalid invite code";
      default:
        return "";
    }
  }, [inviteStatus]);

  const getStatusColor = () => {
    switch (status) {
      case "available":
        return "rgb(34,197,94)";
      case "taken":
        return theme.colors.error[500];
      case "invalid":
        return theme.colors.warning[500];
      default:
        return theme.colors.text.subtle;
    }
  };

  const getInviteStatusColor = () => {
    switch (inviteStatus) {
      case "valid":
        return "rgb(34,197,94)";
      case "used":
      case "expired":
      case "invalid":
        return theme.colors.error[500];
      default:
        return theme.colors.text.subtle;
    }
  };

  const isButtonEnabled =
    status === "available" &&
    (inviteCodeRequired ? inviteCode.trim().length > 0 : true) &&
    !isCreatingWallet &&
    !isSettingUp &&
    inviteStatus !== "checking";

  return (
    <Box flex background="base">
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Setting Up Account"
        description={`Registering @${username} on the blockchain`}
        onDismiss={
          txProgress.progress.phase === "success"
            ? () => {
                txProgress.hideModal();
                router.push({
                  pathname: "/(auth)/recovery-phrase",
                  params: { username },
                });
              }
            : handleDismissError
        }
        onRetry={handleRetry}
        dismissible={
          txProgress.progress.phase === "success" ||
          txProgress.progress.phase === "error"
        }
      />

      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "ios" ? 20 : insets.top },
        ]}
      >
        <Pressable onPress={handleClose} style={styles.closeButton}>
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


      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconContainer}>
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

          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>Hello Friend,</Text>
            <Text style={styles.titleText}>welcome to Mirage</Text>
          </View>

          <Text style={styles.subtitle}>
            {inviteCodeRequired
              ? "Pick a username and enter your invite code to join"
              : "Pick a username to join"}
          </Text>

          {inviteCodeRequired && (
            <>
              <View style={styles.inviteInputWrapper}>
                <Input
                  value={inviteCode}
                  onChangeText={handleInviteCodeChange}
                  placeholder="XXXX-XXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  size="lg"
                  variant="filled"
                  style={styles.input}
                  maxLength={9}
                  rightAccessory={
                    inviteCode.length > 0 ? (
                      <Pressable
                        style={styles.statusIcon}
                        onPress={() => {
                          setInviteCode("");
                          setInviteStatus("idle");
                        }}
                      >
                        {inviteStatus !== "idle" ? (
                          getInviteStatusIcon()
                        ) : (
                          <Ionicons
                            name="close-circle"
                            size={20}
                            color={theme.colors.text.subtle}
                          />
                        )}
                      </Pressable>
                    ) : undefined
                  }
                />
              </View>

              <View
                style={[styles.statusContainer, { marginBottom: theme.spacing.sm }]}
              >
                {inviteStatus !== "idle" ? (
                  <Text size="sm" style={{ color: getInviteStatusColor() }}>
                    {getInviteStatusMessage}
                  </Text>
                ) : (
                  <Text
                    size="sm"
                    style={{ color: theme.colors.neutral[600] }}
                  >
                    Enter an invite code
                  </Text>
                )}
              </View>
            </>
          )}

          <View style={styles.inputWrapper}>
            <Input
              value={username}
              onChangeText={handleUsernameChange}
              placeholder="Choose a username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              size="lg"
              variant="filled"
              style={styles.input}
              maxLength={maxUsernameSize}
              rightAccessory={
                username.length > 0 ? (
                  <View style={styles.statusIcon}>{getStatusIcon()}</View>
                ) : undefined
              }
            />
          </View>

          <View style={styles.statusContainer}>
            {status !== "idle" ? (
              <Text size="sm" style={{ color: getStatusColor() }}>
                {getStatusMessage}
              </Text>
            ) : (
              <Text
                size="sm"
                style={{ color: theme.colors.neutral[600] }}
              >
                This is how people will find you on Mirage
              </Text>
            )}
            {createError && (
              <Text size="sm" style={{ color: theme.colors.error[500] }}>
                {createError}
              </Text>
            )}
          </View>

          <Button
            size="lg"
            rounded="full"
            onPress={handleContinue}
            disabled={!isButtonEnabled}
            loading={
              isCreatingWallet || isSettingUp || inviteStatus === "checking"
            }
            style={[styles.continueButton]}
          >
            <Button.Text weight="medium">
              {inviteStatus === "checking"
                ? "Validating code..."
                : isCreatingWallet || isSettingUp
                  ? "Creating account..."
                  : "Continue"}
            </Button.Text>
          </Button>

          <Text style={styles.termsText}>
            By continuing, you agree to our{" "}
            <Text
              weight="semibold"
              style={styles.termsLink}
              onPress={() => console.log("User Agreement")}
            >
              User Agreement
            </Text>{" "}
            and acknowledge that you understand the{" "}
            <Text
              weight="semibold"
              style={styles.termsLink}
              onPress={() => console.log("Privacy Policy")}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

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
                      setActiveServer(server);
                      apiClient.setBaseUrl(`https://${server}`);
                      queryClient.removeQueries({ queryKey: queryKeys.nodeConfig() });
                      queryClient.removeQueries({ queryKey: queryKeys.config() });
                      queryClient.invalidateQueries({ queryKey: queryKeys.nodeConfig() });
                      queryClient.invalidateQueries({ queryKey: queryKeys.config() });

                      try {
                        const freshNodeConfig = await getNodeConfig();
                        if (!freshNodeConfig.registration_enabled) {
                          setSwitchingServer(null);
                          setShowServerModal(false);
                          setApiServer(server);
                          apiClient.setBaseUrl(`https://${server}`);
                          toast.success(`Switched to ${server}`);
                          router.back();
                          return;
                        }
                        setApiServer(server);
                        toast.success(`Switched to ${server}`);
                      } catch (e) {
                        console.error("[UsernameScreen] Failed to fetch nodeConfig after switch:", e);
                        setActiveServer(activeServer);
                        apiClient.setBaseUrl(`https://${activeServer}`);
                        toast.error(`Failed to connect to ${server}`);
                      }
                      setSwitchingServer(null);
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Divider size="extraThin" />
        <Pressable onPress={handleLogin} style={styles.loginLink}>
          <Text style={styles.loginText}>Log into existing account</Text>
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
    height: 44,
    borderRadius: 16,
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
