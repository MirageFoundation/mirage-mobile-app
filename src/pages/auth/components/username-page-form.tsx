import { Button, Input, Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
  type InviteCodeStatus,
  type ReferralPrecheckStatus,
  type UsernameStatus,
} from "../username-page-types";

interface UsernamePageFormProps {
  alreadyUsedCode: boolean;
  createError: string | null;
  inviteCode: string;
  inviteCodeRequired: boolean;
  inviteStatus: InviteCodeStatus;
  isButtonEnabled: boolean;
  isCreatingWallet: boolean;
  isReferralMode: boolean;
  isSettingUp: boolean;
  maxUsernameSize: number;
  minUsernameSize: number;
  precheckAvailable: number | null;
  precheckError: string | null;
  precheckStatus: ReferralPrecheckStatus;
  status: UsernameStatus;
  username: string;
  onChangeInviteCode: (text: string) => void;
  onChangeUsername: (text: string) => void;
  onContinue: () => void;
  onEnterInviteCodeManually: () => void;
  onResetInviteCode: () => void;
}

export function UsernamePageForm({
  alreadyUsedCode,
  createError,
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
  status,
  username,
  onChangeInviteCode,
  onChangeUsername,
  onContinue,
  onEnterInviteCodeManually,
  onResetInviteCode,
}: UsernamePageFormProps) {
  const { theme } = useUnistyles();

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

  const getStatusMessage = () => {
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
  };

  const getInviteStatusMessage = () => {
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
  };

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

  return (
    <>
      {inviteCodeRequired ? (
        <>
          {precheckStatus === "loading" ? (
            <View style={styles.inviteInputWrapper}>
              <Input
                value="Checking referral..."
                editable={false}
                pointerEvents="none"
                size="lg"
                variant="filled"
                style={[styles.input, styles.disabledInput]}
                rightAccessory={
                  <View style={styles.statusIcon}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.text.subtle}
                    />
                  </View>
                }
              />
            </View>
          ) : isReferralMode ? (
            <>
              <View style={styles.inviteInputWrapper}>
                <Input
                  value="Invite code applied ✓"
                  editable={false}
                  pointerEvents="none"
                  size="lg"
                  variant="filled"
                  style={[styles.input, styles.disabledInput]}
                  rightAccessory={
                    <View style={styles.statusIcon}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="rgb(34,197,94)"
                      />
                    </View>
                  }
                />
              </View>
              {precheckAvailable != null ? (
                <View style={[styles.statusContainer, styles.inviteStatusSpacing]}>
                  <Text size="sm" style={{ color: theme.colors.warning[500] }}>
                    Only {precheckAvailable} codes left
                  </Text>
                </View>
              ) : null}
            </>
          ) : precheckStatus === "error" ? (
            <>
              <View style={styles.inviteInputWrapper}>
                <Input
                  value={precheckError ?? "Referral link is not valid"}
                  editable={false}
                  pointerEvents="none"
                  size="lg"
                  variant="filled"
                  style={[styles.input, styles.disabledInput]}
                  rightAccessory={
                    <View style={styles.statusIcon}>
                      <Ionicons
                        name="close-circle"
                        size={20}
                        color={theme.colors.error[500]}
                      />
                    </View>
                  }
                />
              </View>
              <View style={[styles.statusContainer, styles.inviteStatusSpacing]}>
                <Pressable onPress={onEnterInviteCodeManually}>
                  <Text size="sm" style={styles.actionLink}>
                    Have an invite code? Enter it manually
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.inviteInputWrapper}>
                <Input
                  value={inviteCode}
                  onChangeText={onChangeInviteCode}
                  placeholder="XXXX-XXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  size="lg"
                  variant="filled"
                  style={styles.input}
                  maxLength={9}
                  rightAccessory={
                    inviteCode.length > 0 ? (
                      <Pressable style={styles.statusIcon} onPress={onResetInviteCode}>
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

              <View style={[styles.statusContainer, styles.inviteStatusSpacing]}>
                {inviteStatus !== "idle" ? (
                  <Text size="sm" style={{ color: getInviteStatusColor() }}>
                    {getInviteStatusMessage()}
                  </Text>
                ) : (
                  <Text size="sm" style={{ color: theme.colors.neutral[600] }}>
                    Enter an invite code
                  </Text>
                )}
              </View>
            </>
          )}
        </>
      ) : null}

      {!alreadyUsedCode ? (
        <>
          <View style={styles.inputWrapper}>
            <Input
              value={username}
              onChangeText={onChangeUsername}
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
                {getStatusMessage()}
              </Text>
            ) : (
              <Text size="sm" style={{ color: theme.colors.neutral[600] }}>
                This is how people will find you on Mirage
              </Text>
            )}
            {createError ? (
              <Text size="sm" style={{ color: theme.colors.error[500] }}>
                {createError}
              </Text>
            ) : null}
          </View>

          {precheckStatus !== "loading" ? (
            <Button
              size="lg"
              rounded="full"
              onPress={onContinue}
              disabled={!isButtonEnabled}
              loading={
                isCreatingWallet || isSettingUp || inviteStatus === "checking"
              }
              style={styles.continueButton}
            >
              <Button.Text weight="medium">
                {inviteStatus === "checking"
                  ? "Validating code..."
                  : isCreatingWallet || isSettingUp
                    ? "Creating account..."
                    : "Continue"}
              </Button.Text>
            </Button>
          ) : null}
        </>
      ) : null}

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
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
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
  disabledInput: {
    opacity: 0.6,
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
  inviteStatusSpacing: {
    marginBottom: theme.spacing.sm,
  },
  actionLink: {
    color: "#60A5FA",
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
}));
