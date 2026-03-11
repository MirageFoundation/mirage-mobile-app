import { useFocusEffect } from "@react-navigation/native";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useQueryClient } from "@tanstack/react-query";

import { useConfig } from "@/src/api/read/hooks/use-parameters";
import { useUsernameAvailability } from "@/src/api/read/hooks/use-username-resolution";
import { useUserStatus } from "@/src/api/read";
import { queryKeys } from "@/src/api/read/query-keys";
import { getTxStatus } from "@/src/api/read/endpoints/tx";
import { setUsername as setUsernameOnChain } from "@/src/api/write";
import { TransactionProgressModal } from "@/src/components/molecules";
import {
  Box,
  Button,
  Input,
  Text,
} from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { executeWithProgress, useTransactionProgress } from "@/src/hooks";
import { useToast } from "@/src/providers/toast-provider";
import { walletService } from "@/src/services/wallet-service";
import { useAuthStore } from "@/src/stores";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function ChangeUsernameScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const toast = useToast();

  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const storeUserLevel = useAuthStore((s) => s.userLevel);
  const { data: userStatus, refetch: refetchUserStatus } = useUserStatus();
  const serverLevel = userStatus?.user_level ?? 0;
  const userLevel = Math.max(serverLevel, storeUserLevel);
  const currentUsername = userStatus?.username ?? user?.username ?? "";
  const canChangeName = userLevel > 0;

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const txProgress = useTransactionProgress();

  useFocusEffect(
    useCallback(() => {
      refetchUserStatus();
    }, [refetchUserStatus]),
  );

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const { data: config } = useConfig();
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
      return /^[a-zA-Z0-9-]+$/.test(value);
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
    setError(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (status !== "available" || !canChangeName) return;

    triggerHaptic("selection");
    Keyboard.dismiss();
    setIsSubmitting(true);

    try {
      const wallet = await walletService.getWallet();
      if (!wallet) {
        throw new Error("Wallet not available");
      }

      const txResult = await executeWithProgress(
        txProgress,
        async (onPoWProgress) => {
          txProgress.setPhase("signing");
          const response = await setUsernameOnChain(
            wallet,
            { username },
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
        setIsSubmitting(false);
        return;
      }

      if (user) {
        setUser({ ...user, username });
      }

      if (user?.walletAddress) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(user.walletAddress),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(user.walletAddress),
        });
      }

      triggerHaptic("success");
      toast.success(`Username changed to @${username}`);

      setTimeout(() => {
        txProgress.hideModal();
        router.back();
      }, 1500);
    } catch (err) {
      console.error("[ChangeUsername] Failed:", err);
      triggerHaptic("error");
      setIsSubmitting(false);

      if (!txProgress.isVisible) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to change username. Please try again.",
        );
      }
    }
  }, [status, canChangeName, username, txProgress, router, user, setUser, queryClient, toast]);

  const handleRetry = useCallback(() => {
    txProgress.reset();
    setTimeout(() => handleContinue(), 100);
  }, [txProgress, handleContinue]);

  const handleDismissError = useCallback(() => {
    txProgress.hideModal();
    setIsSubmitting(false);
  }, [txProgress]);

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    router.back();
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
    canChangeName &&
    status === "available" &&
    username.length >= 1 &&
    !isSubmitting;

  return (
    <Box flex background="base">
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Changing Username"
        description={`Updating username to @${username}`}
        onDismiss={
          txProgress.progress.phase === "success"
            ? () => {
                txProgress.hideModal();
                router.back();
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
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons
            name="close"
            size={28}
            color={theme.colors.text.default}
          />
        </Pressable>
        <Text size="lg" weight="medium">
          Change Username
        </Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerContent}>
            <Box mb="lg">
              <Text size="sm" weight="medium" mode="subtle" style={styles.label}>
                Current Username
              </Text>
              <Text size="lg" weight="semibold">
                @{currentUsername}
              </Text>
            </Box>

            <View style={styles.inputWrapper}>
              <Input
                value={username}
                onChangeText={handleUsernameChange}
                placeholder="Enter new username"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                size="lg"
                variant="filled"
                style={styles.input}
                maxLength={maxUsernameSize}
                editable={canChangeName}
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
                  style={{ color: theme.colors.text.subtle, opacity: 0.6 }}
                >
                  This is how people will find you on Mirage
                </Text>
              )}
              {error && (
                <Text size="sm" style={{ color: theme.colors.error[500] }}>
                  {error}
                </Text>
              )}
            </View>

            {!canChangeName && (
              <Box
                p="md"
                rounded="lg"
                mt="md"
                style={{
                  backgroundColor: `${theme.colors.warning[500]}15`,
                  borderWidth: 1,
                  borderColor: `${theme.colors.warning[500]}30`,
                }}
              >
                <Text
                  size="sm"
                  style={{ color: theme.colors.warning[500], lineHeight: 20 }}
                >
                  Changing username is not available for the basic tier. Upgrade your plan to change your username.
                </Text>
                {Platform.OS !== "ios" && (
                  <Pressable
                    onPress={() => router.push("/subscription")}
                    style={{ marginTop: 12 }}
                  >
                    <Text
                      size="sm"
                      weight="semibold"
                      style={{ color: theme.colors.primary[500] }}
                    >
                      Update Subscription
                    </Text>
                  </Pressable>
                )}
              </Box>
            )}
          </View>

          <View style={[styles.bottomButton, { paddingBottom: keyboardVisible ? 12 : insets.bottom + 16 }]}>
            <Button
              size="lg"
              rounded="full"
              onPress={handleContinue}
              disabled={!isButtonEnabled}
              loading={isSubmitting}
            >
              <Button.Text weight="medium">
                {isSubmitting ? "Changing username..." : "Continue"}
              </Button.Text>
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: "center",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
  },
  bottomButton: {
    paddingTop: theme.spacing.lg,
  },
  label: {
    marginBottom: theme.spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrapper: {
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
}));
