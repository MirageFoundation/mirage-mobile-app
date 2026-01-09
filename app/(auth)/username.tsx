import { useConfig } from "@/src/api/read/hooks/use-parameters";
import { useUsernameAvailability } from "@/src/api/read/hooks/use-username-resolution";
import {
  Box,
  Button,
  Divider,
  Input,
  Text,
} from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore, useUIStore } from "@/src/stores";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function UsernameScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const createNewWallet = useAuthStore((s) => s.createNewWallet);
  const isCreatingWallet = useAuthStore((s) => s.isCreatingWallet);

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  // Get config for username size limits
  const { data: config } = useConfig();
  const minUsernameSize = config?.min_username_size ?? 3;
  const maxUsernameSize = config?.max_username_size ?? 20;

  // Check username availability via API (checks both username and anon-username)
  const {
    data: usernameData,
    isLoading: isCheckingUsername,
    isFetched,
  } = useUsernameAvailability(
    username.length >= minUsernameSize ? username : null
  );

  // Validate username format
  const validateUsername = useCallback(
    (value: string) => {
      // Username rules: min-max chars, alphanumeric + hyphens (must match backend)
      if (value.length < minUsernameSize || value.length > maxUsernameSize) {
        return false;
      }
      const isValid = /^[a-z0-9-]+$/.test(value);
      return isValid;
    },
    [minUsernameSize, maxUsernameSize]
  );

  // Update status based on validation and API response
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
    // Only allow valid characters
    const sanitized = text.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setUsername(sanitized);
    setCreateError(null);
  }, []);

  const handleContinue = useCallback(async () => {
    if (status !== "available") return;

    triggerHaptic("selection");
    Keyboard.dismiss();

    try {
      // Create new wallet and get mnemonic
      const mnemonic = await createNewWallet();

      if (!mnemonic) {
        throw new Error("Failed to generate wallet");
      }

      triggerHaptic("success");

      // Navigate to recovery phrase screen with username
      router.push({
        pathname: "/(auth)/recovery-phrase",
        params: { username },
      });
    } catch (error) {
      console.error("[Username] Failed to create wallet:", error);
      triggerHaptic("error");

      if (error instanceof Error) {
        if (error.message.includes("already exists")) {
          setCreateError("A wallet already exists. Please logout first.");
        } else {
          setCreateError("Failed to create wallet. Please try again.");
        }
      } else {
        setCreateError("An unexpected error occurred.");
      }
    }
  }, [status, username, createNewWallet, router]);

  const handleClose = useCallback(() => {
    triggerHaptic("selection");
    router.back();
    // Show auth sheet after going back
    setTimeout(() => {
      showAuthSheet();
    }, 100);
  }, [router, showAuthSheet]);

  const handleLogin = useCallback(() => {
    triggerHaptic("selection");
    router.replace("/(auth)/login");
  }, [router]);

  const getStatusIcon = () => {
    switch (status) {
      case "checking":
        return (
          <ActivityIndicator size="small" color={theme.colors.text.subtle} />
        );
      case "available":
        return <Ionicons name="checkmark" size={20} color="rgb(47,105,35)" />;
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
        return "rgb(47,105,35)";
      case "taken":
        return theme.colors.error[500];
      case "invalid":
        return theme.colors.warning[500];
      default:
        return theme.colors.text.subtle;
    }
  };

  const isButtonEnabled = status === "available" && !isCreatingWallet;

  return (
    <Box flex background="base">
      {/* Header with close button */}
      <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? 20 : insets.top }]}>
        <Pressable onPress={handleClose} style={styles.closeButton}>
          <EvilIcons name="close" size={36} color={theme.colors.text.default} />
        </Pressable>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* App Icon */}
        <View style={styles.iconContainer}>
          <Image
            source={require("@/assets/images/app-icon.png")}
            style={styles.appIcon}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <View style={styles.titleContainer}>
          <Text style={styles.titleText}>Hi new friend,</Text>
          <Text style={styles.titleText}>welcome to Mirage</Text>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>Choose your username to get started</Text>

        {/* Username input */}
        <View style={styles.inputWrapper}>
          <Input
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="Username"
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

        {/* Status message */}
        <View style={styles.statusContainer}>
          {status !== "idle" && (
            <Text size="sm" style={{ color: getStatusColor() }}>
              {getStatusMessage}
            </Text>
          )}
          {createError && (
            <Text size="sm" style={{ color: theme.colors.error[500] }}>
              {createError}
            </Text>
          )}
        </View>

        {/* Continue button */}
        <Button
          size="lg"
          rounded="full"
          onPress={handleContinue}
          disabled={!isButtonEnabled}
          loading={isCreatingWallet}
          style={[styles.continueButton]}
        >
          <Button.Text weight="medium">
            {isCreatingWallet ? "Creating wallet..." : "Continue"}
          </Button.Text>
        </Button>

        {/* Terms text */}
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
      </View>

      {/* Footer */}
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
    paddingHorizontal: theme.spacing.sm,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
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
    color: "rgb(34,74,154)",
    fontSize: 13,
    fontWeight: "500",
  },
}));
