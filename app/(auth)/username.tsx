import {
  Box,
  Button,
  Divider,
  Input,
  Text,
} from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useUIStore } from "@/src/stores";
import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
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

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");

  // Validate username format
  const validateUsername = useCallback((value: string) => {
    // Username rules: 3-20 chars, alphanumeric + underscores, starts with letter
    const isValid = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(value);
    return isValid;
  }, []);

  // Simulate checking username availability
  useEffect(() => {
    if (username.length === 0) {
      setStatus("idle");
      return;
    }

    if (!validateUsername(username)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");

    // Simulate API call
    const timer = setTimeout(() => {
      // Mock: usernames containing "taken" are unavailable
      if (username.toLowerCase().includes("taken")) {
        setStatus("taken");
      } else {
        setStatus("available");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, validateUsername]);

  const handleUsernameChange = useCallback((text: string) => {
    // Only allow valid characters
    const sanitized = text.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(sanitized);
  }, []);

  const handleContinue = useCallback(() => {
    if (status !== "available") return;

    triggerHaptic("success");
    Keyboard.dismiss();

    // Navigate to recovery phrase screen
    router.push({
      pathname: "/(auth)/recovery-phrase",
      params: { username },
    });
  }, [status, username, router]);

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

  const getStatusMessage = () => {
    switch (status) {
      case "checking":
        return "Checking availability...";
      case "available":
        return "Great name! It's not taken, so it's all yours.";
      case "taken":
        return "This username is already taken";
      case "invalid":
        return "3-20 characters, letters, numbers, underscores only";
      default:
        return "";
    }
  };

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

  const isButtonEnabled = status === "available";

  return (
    <Box flex background="base">
      {/* Header with close button */}
      <View style={[styles.header, { paddingTop: 20 }]}>
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
            maxLength={20}
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
              {getStatusMessage()}
            </Text>
          )}
        </View>

        {/* Continue button */}
        <Button
          size="lg"
          rounded="full"
          onPress={handleContinue}
          disabled={!isButtonEnabled}
          style={[
            styles.continueButton,
            {
              backgroundColor: isButtonEnabled
                ? "rgb(226, 79, 34)"
                : "rgb(242,242,242)",
            },
          ]}
        >
          <Button.Text
            weight="medium"
            style={{
              color: isButtonEnabled ? "#fff" : theme.colors.text.subtle,
            }}
          >
            Continue
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
    width: 64,
    height: 64,
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
    color: "rgb(100,100,100)",
  },
  inputWrapper: {
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: "rgb(230,236,238)",
    paddingLeft: 12,
  },
  statusIcon: {
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgb(230,236,238)",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  statusContainer: {
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 8,
    height: 20,
    // backgroundColor: "red",
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
