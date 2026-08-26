import { useFocusEffect } from "expo-router/react-navigation";
import * as Sentry from "@sentry/react-native";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useQueryClient } from "@tanstack/react-query";

import { useConfig } from "@/src/api/read/hooks/use-parameters";
import { useAddressFromUsername } from "@/src/api/read/hooks/use-username-resolution";
import { useUserStatus } from "@/src/api/read";
import {
  cancelUsernameRelatedQueries,
  invalidateUsernameRelatedQueries,
  updateUsernameAcrossCaches,
} from "@/src/api/cache";
import { setUsername as setUsernameOnChain } from "@/src/api/write";
import { TransactionProgressModal } from "@/src/components/molecules";
import DicebearAvatar from "@/src/components/ui/dicebear-avatar";
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

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "same";

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
  const canChangeName = userLevel >= 1;

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const txProgress = useTransactionProgress();
  const bottomPadding = useSharedValue(insets.bottom + 16);

  useFocusEffect(
    useCallback(() => {
      refetchUserStatus();
    }, [refetchUserStatus]),
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => {
      bottomPadding.value = withTiming(12, { duration: 250 });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      bottomPadding.value = withTiming(insets.bottom + 16, { duration: 250 });
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, [bottomPadding, insets.bottom]);

  const animatedBottomStyle = useAnimatedStyle(() => ({
    paddingBottom: bottomPadding.value,
  }));

  const { data: config } = useConfig();
  const minUsernameSize = config?.min_username_size ?? 3;
  const maxUsernameSize = config?.max_username_size ?? 20;

  const {
    data: usernameData,
    isLoading: isCheckingUsername,
    isFetched,
  } = useAddressFromUsername(
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

  const isSameAsCurrentUsername = useCallback(
    (value: string) => {
      const lower = value.toLowerCase();
      const current = currentUsername.toLowerCase();
      return lower === current;
    },
    [currentUsername],
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

    if (isSameAsCurrentUsername(username)) {
      setStatus("same");
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
  }, [username, validateUsername, isSameAsCurrentUsername, isCheckingUsername, isFetched, usernameData]);

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
          return setUsernameOnChain(wallet, { username }, onPoWProgress);
        },
      );

      if (!txResult.success) {
        setIsSubmitting(false);
        return;
      }

      if (user) {
        setUser({ ...user, username });
      }

      const walletAddr = user?.walletAddress;
      const applyOptimisticUpdates = () => {
        if (!walletAddr) return;
        updateUsernameAcrossCaches(queryClient, walletAddr, username);
      };

      applyOptimisticUpdates();

      if (walletAddr) {
        void cancelUsernameRelatedQueries(queryClient, walletAddr);

        setTimeout(() => {
          applyOptimisticUpdates();
        }, 1000);

        setTimeout(() => {
          applyOptimisticUpdates();
        }, 3000);

        setTimeout(() => {
          void invalidateUsernameRelatedQueries(queryClient, walletAddr);
        }, 15000);
      }

      triggerHaptic("success");
      toast.success(`Username changed to @${username}`);

      setTimeout(() => {
        setIsSubmitting(false);
        router.back();
      }, 500);
    } catch (err) {
      Sentry.captureException(err, { tags: { feature: "change-username" } });
      triggerHaptic("error");
      setIsSubmitting(false);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to change username. Please try again.",
      );
    }
  }, [status, canChangeName, username, txProgress, router, user, setUser, queryClient, toast]);

  const handleDismissProgress = useCallback(() => {
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
      case "same":
        return (
          <Ionicons
            name="information-circle"
            size={20}
            color={theme.colors.warning[500]}
          />
        );
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
      case "same":
        return "This is your current username, try something different.";
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
      case "same":
        return theme.colors.warning[500];
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

  const avatarSeed = user?.walletAddress ?? currentUsername ?? "";

  return (
    <Box flex background="base">
      <TransactionProgressModal
        visible={txProgress.isVisible}
        progress={txProgress.progress}
        title="Changing Username"
        description={`Updating username to @${username}`}
        onDismiss={handleDismissProgress}
        showTxHash={false}
        autoDismissDelay={500}
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
            <View style={styles.avatarContainer}>
              <View
                style={[
                  styles.avatarRing,
                  {
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.subtle,
                  },
                ]}
              >
                <DicebearAvatar
                  seed={avatarSeed}
                  size={48}
                  rounded="none"
                  border="none"
                />
              </View>
            </View>

            <View
              style={[
                styles.currentBadge,
                {
                  backgroundColor: `${theme.colors.primary[500]}10`,
                  borderColor: `${theme.colors.primary[500]}25`,
                },
              ]}
            >
              <Text size="sm" mode="subtle" style={styles.currentLabel}>
                CURRENT
              </Text>
              <Text size="lg" weight="bold">
                @{currentUsername}
              </Text>
            </View>

            <View style={styles.arrowContainer}>
              <Ionicons
                name="arrow-down"
                size={22}
                color={theme.colors.text.subtle}
              />
            </View>

            <Text size="md" weight="semibold" style={styles.newLabel}>
              New Username
            </Text>

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

            <View style={styles.statusRow}>
              <View style={{ flex: 1 }}>
                {status !== "idle" ? (
                  <Text size="sm" style={{ color: getStatusColor() }}>
                    {getStatusMessage}
                  </Text>
                ) : (
                  <Text
                    size="sm"
                    style={{ color: theme.colors.text.subtle }}
                  >
                    This is how people will find you on Mirage
                  </Text>
                )}
                {error && (
                  <Text
                    size="sm"
                    style={{ color: theme.colors.error[500], marginTop: 4 }}
                  >
                    {error}
                  </Text>
                )}
              </View>
              {username.length > 0 && (
                <Text
                  size="xs"
                  style={{
                    color:
                      username.length >= minUsernameSize
                        ? theme.colors.text.subtle
                        : theme.colors.warning[500],
                    marginLeft: 8,
                  }}
                >
                  {username.length}/{maxUsernameSize}
                </Text>
              )}
            </View>

            {!canChangeName && (
              <View
                style={[
                  styles.upgradeCard,
                  {
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.subtle,
                  },
                ]}
              >
                <View style={styles.upgradeHeaderRow}>
                  <View
                    style={[
                      styles.upgradeIconBadge,
                      {
                        backgroundColor: `${theme.colors.brand[500]}15`,
                        borderColor: `${theme.colors.brand[500]}30`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="sparkles"
                      size={16}
                      color={theme.colors.brand[500]}
                    />
                  </View>
                  <View style={styles.upgradeHeaderText}>
                    <Text size="sm" weight="semibold">
                      Premium Feature
                    </Text>
                    <Text
                      size="xs"
                      mode="subtle"
                      style={styles.upgradeSubtitle}
                    >
                      Upgrade your plan to change your username
                    </Text>
                  </View>
                </View>
                {Platform.OS !== "ios" && (
                  <Button
                    size="sm"
                    rounded="full"
                    mode="brand"
                    onPress={() => router.push("/subscription")}
                    style={styles.upgradeButton}
                  >
                    <Button.Text weight="semibold">Upgrade Plan</Button.Text>
                  </Button>
                )}
              </View>
            )}
          </View>

          <Animated.View
            style={[
              styles.bottomButton,
              animatedBottomStyle,
            ]}
          >
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
          </Animated.View>
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
    alignItems: "stretch",
  },
  avatarContainer: {
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  avatarRing: {
    padding: theme.spacing.md,
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  currentBadge: {
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  currentLabel: {
    letterSpacing: 1.2,
    marginBottom: 4,
    opacity: 0.7,
    fontSize: 11,
  },
  arrowContainer: {
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
  },
  newLabel: {
    marginBottom: theme.spacing.sm,
  },
  bottomButton: {
    paddingTop: theme.spacing.lg,
  },
  inputWrapper: {
    marginBottom: theme.spacing.xs,
  },
  input: {
    paddingHorizontal: theme.spacing.md,
  },
  statusIcon: {
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background.subtle,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    minHeight: 20,
    marginTop: 4,
  },
  upgradeCard: {
    padding: theme.spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: theme.spacing.lg,
  },
  upgradeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  upgradeIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  upgradeHeaderText: {
    flex: 1,
  },
  upgradeSubtitle: {
    marginTop: 2,
    lineHeight: 16,
  },
  upgradeButton: {
    marginTop: theme.spacing.md,
  },
}));
