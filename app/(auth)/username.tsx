import { useState, useCallback, useEffect } from "react";
import { View, Pressable, Keyboard } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Box, Text, Button, Input } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function UsernameScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

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

  const handleBack = useCallback(() => {
    triggerHaptic("selection");
    router.back();
  }, [router]);

  const getStatusIcon = () => {
    switch (status) {
      case "checking":
        return (
          <Ionicons
            name="sync"
            size={20}
            color={theme.colors.text.subtle}
          />
        );
      case "available":
        return (
          <Ionicons
            name="checkmark-circle"
            size={20}
            color={theme.colors.success[500]}
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

  const getStatusMessage = () => {
    switch (status) {
      case "checking":
        return "Checking availability...";
      case "available":
        return "Username is available!";
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
        return theme.colors.success[500];
      case "taken":
        return theme.colors.error[500];
      case "invalid":
        return theme.colors.warning[500];
      default:
        return theme.colors.text.subtle;
    }
  };

  return (
    <Box flex background="base" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="semibold">
          Create Account
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Box center style={{ marginBottom: 32 }}>
          <Text size="xxl" weight="bold">
            Choose your username
          </Text>
          <Text size="sm" mode="subtle" style={{ marginTop: 8, textAlign: "center" }}>
            This will be your identity on Mirage
          </Text>
        </Box>

        {/* Username input */}
        <View style={styles.inputContainer}>
          <View style={styles.atSymbol}>
            <Text size="lg" mode="subtle" weight="medium">
              @
            </Text>
          </View>
          <Input
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            size="lg"
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
        {status !== "idle" && (
          <View style={styles.statusContainer}>
            <Text size="sm" style={{ color: getStatusColor() }}>
              {getStatusMessage()}
            </Text>
          </View>
        )}

        {/* Username rules */}
        <View style={styles.rules}>
          <Text size="xs" mode="subtle">
            • Must start with a letter
          </Text>
          <Text size="xs" mode="subtle">
            • 3-20 characters long
          </Text>
          <Text size="xs" mode="subtle">
            • Only letters, numbers, and underscores
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="lg"
          onPress={handleContinue}
          disabled={status !== "available"}
          style={{ width: "100%" }}
        >
          <Button.Text weight="semibold">Continue</Button.Text>
          <Button.Icon>
            {({ color, size }) => (
              <Ionicons name="arrow-forward" size={size} color={color} />
            )}
          </Button.Icon>
        </Button>
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
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.subtle,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  atSymbol: {
    width: 32,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
  },
  statusIcon: {
    paddingHorizontal: theme.spacing.sm,
  },
  statusContainer: {
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  rules: {
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
}));
