import { clearServerScopedQueries } from "@/src/api/cache/server-cache";
import { getNodeConfig } from "@/src/api/read/endpoints/parameters";
import { RecoveryPhraseInput } from "@/src/components/molecules";
import { Box, Button } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useServerList } from "@/src/hooks/use-server-list";
import { useRouter } from "@/src/navigation/guarded-router";
import { useToast } from "@/src/providers/toast-provider";
import { apiClient } from "@/src/api/client";
import { usePreferencesStore, type ApiServer } from "@/src/stores";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AuthRouteHeader } from "./components/auth-route-header";
import { LoginErrorMessage } from "./components/login-error-message";
import { LoginPageFooter } from "./components/login-page-footer";
import { LoginPageTitle } from "./components/login-page-title";
import { NodeSwitchModal } from "./components/node-switch-modal";
import { RegistrationUnavailableModal } from "./components/registration-unavailable-modal";
import { useAuthServerBaseUrl } from "./use-auth-server-base-url";
import { useLoginForm } from "./use-login-form";

export default function LoginScreen() {
  const router = useRouter();
  const { rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const toast = useToast();

  const savedServer = usePreferencesStore((s) => s.apiServer);
  const setApiServer = usePreferencesStore((s) => s.setApiServer);
  const [activeServer, setActiveServer] = useState<ApiServer>(savedServer);
  const [showServerModal, setShowServerModal] = useState(false);
  const [switchingServer, setSwitchingServer] = useState<ApiServer | null>(null);
  const [showRegPopup, setShowRegPopup] = useState(false);
  const [isSwitchingReg, setIsSwitchingReg] = useState(false);
  const [nodeConfigData, setNodeConfigData] = useState<{ registration_enabled: boolean } | null>(null);

  const { servers } = useServerList();
  const alternateServer = servers.find((server) => server !== activeServer) ?? servers[0];

  const {
    errors,
    handleComplete,
    handleLogin,
    handleWordsChange,
    isComplete,
    isLoading,
    loginError,
    words,
  } = useLoginForm();

  useAuthServerBaseUrl(activeServer);

  useEffect(() => {
    getNodeConfig()
      .then((config) => setNodeConfigData(config))
      .catch(() => setNodeConfigData(null));
  }, [activeServer]);

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    apiClient.setBaseUrl(`https://${usePreferencesStore.getState().apiServer}`);
    router.back();
  }, [router]);

  const handleSwitchServer = useCallback(
    async (server: ApiServer) => {
      if (server === activeServer) {
        setShowServerModal(false);
        return;
      }

      setSwitchingServer(server);
      try {
        apiClient.setBaseUrl(`https://${server}`);
        clearServerScopedQueries(queryClient);
        await getNodeConfig();
        setActiveServer(server);
        setApiServer(server);
        toast.success(`Switched to ${server}`);
      } catch {
        apiClient.setBaseUrl(`https://${activeServer}`);
        toast.error(`Failed to connect to ${server}`);
      } finally {
        setSwitchingServer(null);
        setShowServerModal(false);
      }
    },
    [activeServer, queryClient, setApiServer, toast],
  );

  const handleSwitchToRegistrationServer = useCallback(async () => {
    setIsSwitchingReg(true);
    try {
      apiClient.setBaseUrl(`https://${alternateServer}`);
      clearServerScopedQueries(queryClient);
      const config = await getNodeConfig();
      setActiveServer(alternateServer);
      setApiServer(alternateServer);
      setNodeConfigData(config);
      setShowRegPopup(false);
      toast.success(`Switched to ${alternateServer}`);
      if (config.registration_enabled) {
        router.replace("/(auth)/username");
      }
    } catch {
      apiClient.setBaseUrl(`https://${activeServer}`);
      toast.error(`Failed to connect to ${alternateServer}`);
    } finally {
      setIsSwitchingReg(false);
    }
  }, [activeServer, alternateServer, queryClient, router, setApiServer, toast]);

  const handleCreateAccount = useCallback(() => {
    triggerHaptic("selection");
    if (nodeConfigData && !nodeConfigData.registration_enabled) {
      setShowRegPopup(true);
      return;
    }
    router.replace("/(auth)/username");
  }, [nodeConfigData, router]);

  return (
    <Box flex background="base">
      <AuthRouteHeader
        topInset={Platform.OS === "ios" ? 20 : insets.top}
        onClose={handleBack}
        serverLabel={activeServer}
        onServerPress={() => setShowServerModal(true)}
      />

      <View style={styles.scrollView}>
        <LoginPageTitle isDark={isDark} />

        <View style={styles.inputContainer}>
          <RecoveryPhraseInput
            words={words}
            onWordsChange={handleWordsChange}
            errors={errors}
            onComplete={handleComplete}
          />
        </View>

        <LoginErrorMessage message={loginError} />

        <Button
          size="lg"
          rounded="full"
          onPress={handleLogin}
          disabled={!isComplete || isLoading}
          loading={isLoading}
          gap="sm"
          style={styles.loginButton}
        >
          <Button.Text weight="medium">
            {isLoading ? "Logging in..." : "Log in"}
          </Button.Text>
        </Button>
      </View>

      <NodeSwitchModal
        visible={showServerModal}
        activeServer={activeServer}
        servers={servers}
        switchingServer={switchingServer}
        onClose={() => setShowServerModal(false)}
        onSelectServer={handleSwitchServer}
      />

      <RegistrationUnavailableModal
        visible={showRegPopup}
        activeServer={activeServer}
        targetServer={alternateServer}
        isSwitching={isSwitchingReg}
        onClose={() => setShowRegPopup(false)}
        onSwitch={handleSwitchToRegistrationServer}
      />

      <LoginPageFooter
        bottomInset={insets.bottom}
        onCreateAccount={handleCreateAccount}
      />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  scrollView: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "center",
  },
  inputContainer: {
    marginBottom: theme.spacing.sm,
  },
  loginButton: {
    width: "100%",
  },
}));
