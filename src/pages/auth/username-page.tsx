import { Box } from "@/src/components/ui/primitives";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AuthRouteHeader } from "./components/auth-route-header";
import { NodeSwitchModal } from "./components/node-switch-modal";
import { UsernamePageFooter } from "./components/username-page-footer";
import { UsernamePageForm } from "./components/username-page-form";
import { UsernamePageHero } from "./components/username-page-hero";
import { UsernameTransactionModal } from "./components/username-transaction-modal";
import { useUsernameRegistration } from "./use-username-registration";

export default function UsernameScreen() {
  const { rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();

  const {
    activeServer,
    alreadyUsedCode,
    createError,
    handleClose,
    handleContinue,
    handleDismissError,
    handleEnterManually,
    handleInviteCodeChange,
    handleLogin,
    handleRetry,
    handleSwitchServer,
    handleUsernameChange,
    inviteCode,
    inviteCodeRequired,
    inviteStatus,
    isButtonEnabled,
    isCreatingWallet,
    isReferralMode,
    isSettingUp,
    maxUsernameSize,
    minUsernameSize,
    precheckAvailable,
    precheckError,
    precheckStatus,
    setShowServerModal,
    showServerModal,
    servers,
    status,
    switchingServer,
    txProgress,
    username,
  } = useUsernameRegistration();

  return (
    <Box flex background="base">
      <UsernameTransactionModal
        username={username}
        txProgress={txProgress}
        onDismissError={handleDismissError}
        onRetry={handleRetry}
      />

      <AuthRouteHeader
        topInset={Platform.OS === "ios" ? 20 : insets.top}
        onClose={handleClose}
        serverLabel={activeServer}
        onServerPress={() => setShowServerModal(true)}
      />

      <KeyboardAvoidingView behavior="padding" style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <UsernamePageHero
            isDark={isDark}
            inviteCodeRequired={inviteCodeRequired}
          />

          <UsernamePageForm
            alreadyUsedCode={alreadyUsedCode}
            createError={createError}
            inviteCode={inviteCode}
            inviteCodeRequired={inviteCodeRequired}
            inviteStatus={inviteStatus}
            isButtonEnabled={isButtonEnabled}
            isCreatingWallet={isCreatingWallet}
            isReferralMode={isReferralMode}
            isSettingUp={isSettingUp}
            maxUsernameSize={maxUsernameSize}
            minUsernameSize={minUsernameSize}
            precheckAvailable={precheckAvailable}
            precheckError={precheckError}
            precheckStatus={precheckStatus}
            status={status}
            username={username}
            onChangeInviteCode={handleInviteCodeChange}
            onChangeUsername={handleUsernameChange}
            onContinue={handleContinue}
            onEnterInviteCodeManually={handleEnterManually}
            onResetInviteCode={() => handleInviteCodeChange("")}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <NodeSwitchModal
        visible={showServerModal}
        activeServer={activeServer}
        servers={servers}
        switchingServer={switchingServer}
        onClose={() => setShowServerModal(false)}
        onSelectServer={handleSwitchServer}
      />

      <UsernamePageFooter bottomInset={insets.bottom} onLogin={handleLogin} />
    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "center",
  },
}));
