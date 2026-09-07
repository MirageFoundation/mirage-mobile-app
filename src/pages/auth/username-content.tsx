import { useConfig, useNodeConfig } from "@/src/api/read/hooks/use-parameters";
import { queryKeys } from "@/src/api/read/query-keys";
import { useUsernameAvailability } from "@/src/api/read/hooks/use-username-resolution";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { useSignupRegistration } from "./use-signup-registration";
import { PendingSignupRecovery } from "./pending-signup-recovery";
import { canSubmitRegistration } from "@/src/domain/auth/registration-gate";
import { TransactionProgressModal } from "@/src/components/molecules";
import { Box, Button, Input, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useServerList } from "@/src/hooks";
import { trackEvent } from "@/src/services/analytics";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore, type ApiServer } from "@/src/stores";
import { apiClient } from "@/src/api/client";
import { usePreferencesStore } from "@/src/stores";
import { useToast } from "@/src/providers/toast-provider";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { UsernameFooter } from "./username-footer";
import { UsernameHeader } from "./username-header";
import { UsernameRegistrationUnavailableModal } from "./username-registration-unavailable-modal";
import { UsernameServerModal } from "./username-server-modal";
import { styles } from "./username-styles";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "error";

export default function UsernameScreen() {
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const isCreatingWallet = useAuthStore((s) => s.isCreatingWallet);
  const [username, setUsername] = useState(() => walletService.getWalletMetadata()?.signup?.username ?? "");
  const savedServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);
  const [activeServer, setActiveServer] = useState<ApiServer>(savedServer);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);
  const toast = useToast();
  const { servers } = useServerList();


  useEffect(() => {
    trackEvent("onboarding_started");
  }, []);

  useEffect(() => {
    console.log("[UsernameScreen] activeServer:", activeServer);
    apiClient.setBaseUrl(`https://${activeServer}`);
  }, [activeServer]);

  useEffect(() => {
    return () => {
      const currentServer = usePreferencesStore.getState().apiServer;
      apiClient.setBaseUrl(`https://${currentServer}`);
    };
  }, []);

  const { data: config } = useConfig();
  const { data: nodeConfig, isError: nodeConfigError, isFetching: nodeConfigFetching, refetch: refetchNodeConfig } = useNodeConfig();
  const nodeConfigLoaded = typeof nodeConfig?.registration_enabled === "boolean";
  const registrationEnabled = nodeConfig?.registration_enabled === true && !nodeConfigError && !nodeConfigFetching;
  const [showRegPopup, setShowRegPopup] = useState(false);
  const [isSwitchingNode, setIsSwitchingNode] = useState(false);
  const otherServer = servers.find((s) => s !== activeServer) ?? servers[0];
  const minUsernameSize = config?.min_username_size ?? 3;
  const maxUsernameSize = config?.max_username_size ?? 20;

  useEffect(() => {
    if (nodeConfig?.registration_enabled === false && !walletService.getWalletMetadata()?.pending) {
      setShowRegPopup(true);
    }
  }, [nodeConfig, registrationEnabled]);

  const handleSwitchNode = useCallback(async () => {
    triggerHaptic("selection");
    setIsSwitchingNode(true);
    try {
      const newServer = otherServer;
      apiClient.setBaseUrl(`https://${newServer}`);
      queryClient.removeQueries({ queryKey: queryKeys.nodeConfig() });
      queryClient.removeQueries({ queryKey: queryKeys.config() });
      await queryClient.invalidateQueries();
      const freshNodeConfig = await getNodeConfig();
      setActiveServer(newServer as ApiServer);
      setApiServer(newServer as ApiServer);
      setShowRegPopup(false);
      toast.success(`Switched to ${newServer}`);
      if (!freshNodeConfig.registration_enabled) {
        router.replace("/");
      }
    } catch (e) {
      console.error("[UsernameScreen] Failed to switch node:", e);
      toast.error(`Failed to connect to ${otherServer}`);
    } finally {
      setIsSwitchingNode(false);
    }
  }, [otherServer, setApiServer, queryClient, router, toast]);

  const {
    data: usernameData,
    isLoading: isCheckingUsername,
    isFetching: isFetchingUsername,
    isError: availabilityError,
    refetch: refetchAvailability,
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

  const status: UsernameStatus = !username ? "idle" : !validateUsername(username) ? "invalid"
    : availabilityError ? "error" : isCheckingUsername || isFetchingUsername ? "checking"
    : isFetched && usernameData ? usernameData.exists ? "taken" : "available" : "checking";
  const currentName = useRef(username);
  currentName.current = username;
  const authorize = useCallback(async () => {
    if (!registrationEnabled || !nodeConfigLoaded || status !== "available") return false;
    const context = apiClient.getCurrentServerContext();
    const [freshConfig, freshAvailability] = await Promise.all([getNodeConfig(), refetchAvailability()]);
    return canSubmitRegistration({
      currentUsername: currentName.current, requestedUsername: username,
      sameServer: apiClient.getCurrentServerContext().generation === context.generation,
      registrationEnabled: freshConfig.registration_enabled, results: freshAvailability,
    });
  }, [registrationEnabled, nodeConfigLoaded, status, username, refetchAvailability]);
  const {
    txProgress, isSettingUp, createError, setCreateError, handleContinue,
    handleRetry, handleDismissError, handleRecoveryPhraseNavigation,
  } = useSignupRegistration(username, authorize);
  const pending = walletService.getWalletMetadata();
  const needsReconciliation = pending?.pending && pending.signup?.phase !== "wallet_generated";
  const handleUsernameChange = useCallback((text: string) => {
    if (isSettingUp || needsReconciliation) return;
    const sanitized = text.replace(/[^a-zA-Z0-9-]/g, "");
    currentName.current = sanitized;
    setUsername(sanitized);
    setCreateError(null);
  }, [isSettingUp, needsReconciliation, setCreateError]);

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.back();
  }, [router]);

  const handleLogin = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.replace("/login");
  }, [router]);

  const handleRegistrationUnavailableCancel = useCallback(() => {
    setShowRegPopup(false);
    router.replace("/");
  }, [router]);

  const handleSelectServer = useCallback(
    async (server: ApiServer) => {
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
      setShowServerModal(false);
    },
    [activeServer, queryClient, router, setApiServer, toast],
  );

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

  const getStatusMessage = useMemo(() => {
    switch (status) {
      case "error":
        return "Availability check failed. Retry before continuing.";
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

  const isButtonEnabled =
    (needsReconciliation || (status === "available" && registrationEnabled)) &&
    !isCreatingWallet && !isSettingUp;

  return (
    <Box flex background="base">
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Setting Up Account"
        description={`Registering @${username} on the blockchain`}
        onDismiss={
          txProgress.progress.phase === "success"
            ? handleRecoveryPhraseNavigation
            : handleDismissError
        }
        onRetry={handleRetry}
        autoDismissDelay={1500}
        dismissible={
          txProgress.progress.phase === "success" ||
          txProgress.progress.phase === "error"
        }
      />

      <UsernameHeader
        activeServer={activeServer}
        insetsTop={insets.top}
        onClose={() => { if (!isSettingUp) handleClose(); }}
        onOpenServerModal={() => { if (!isSettingUp) setShowServerModal(true); }}
      />

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
            Pick a username to join
          </Text>

          <View style={styles.inputWrapper}>
                <Input
                  value={username}
                  editable={!isSettingUp && !needsReconciliation}
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
                {!needsReconciliation && (!registrationEnabled || availabilityError) && (
                  <Button variant="ghost" onPress={() => { void refetchNodeConfig(); void refetchAvailability(); }}>
                    <Button.Text>{nodeConfigError ? "Configuration unavailable - retry" : nodeConfigFetching ? "Loading configuration..." : nodeConfig?.registration_enabled === false ? "Registration disabled - check again" : "Retry availability"}</Button.Text>
                  </Button>
                )}
                {needsReconciliation && <Text size="sm">Your signup key is retained. Check registration to resume; no transaction will be resent.</Text>}
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
                loading={isCreatingWallet || isSettingUp}
                style={[styles.continueButton]}
              >
                <Button.Text weight="medium">
                  {isCreatingWallet || isSettingUp
                    ? "Creating account..."
                    : needsReconciliation ? "Check registration / resume" : "Continue"}
                </Button.Text>
              </Button>

          {pending?.pending && <PendingSignupRecovery busy={isSettingUp || isCreatingWallet} />}
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

      <UsernameServerModal
        activeServer={activeServer}
        servers={servers as ApiServer[]}
        switchingServer={switchingServer}
        visible={showServerModal}
        onClose={() => setShowServerModal(false)}
        onSelectServer={handleSelectServer}
      />

      <UsernameRegistrationUnavailableModal
        activeServer={activeServer}
        isSwitchingNode={isSwitchingNode}
        otherServer={otherServer as ApiServer}
        visible={showRegPopup}
        onCancel={handleRegistrationUnavailableCancel}
        onSwitchNode={handleSwitchNode}
      />

      <UsernameFooter bottomInset={insets.bottom} onLogin={() => { if (!isSettingUp) handleLogin(); }} />
    </Box>
  );
}
