import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useCallback, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInput as TextInputType,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type AgeVerificationModalProps = {
  visible: boolean;
  onVerified: () => void;
  onCancel: () => void;
};

export function AgeVerificationModal({
  visible,
  onVerified,
  onCancel,
}: AgeVerificationModalProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const dayRef = useRef<TextInputType>(null);
  const yearRef = useRef<TextInputType>(null);

  const handleVerify = useCallback((yearOverride?: string) => {
    setError("");
    Keyboard.dismiss();

    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    const y = parseInt(yearOverride ?? year, 10);

    if (
      !m ||
      !d ||
      !y ||
      m < 1 ||
      m > 12 ||
      d < 1 ||
      d > 31 ||
      y < 1900 ||
      y > new Date().getFullYear()
    ) {
      setError("Please enter a valid date of birth");
      return;
    }

    const birthDate = new Date(y, m - 1, d);
    if (
      birthDate.getMonth() !== m - 1 ||
      birthDate.getDate() !== d ||
      birthDate.getFullYear() !== y
    ) {
      setError("Please enter a valid date of birth");
      return;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    if (age < 18) {
      setError("You are not eligible to view this content");
      return;
    }

    triggerHaptic("success");
    setMonth("");
    setDay("");
    setYear("");
    onVerified();
  }, [month, day, year, onVerified]);

  const handleCancel = useCallback(() => {
    triggerHaptic("light");
    setError("");
    setMonth("");
    setDay("");
    setYear("");
    onCancel();
  }, [onCancel]);

  const handleBackdropPress = useCallback(() => {
    if (keyboardOpen) {
      Keyboard.dismiss();
    } else {
      handleCancel();
    }
  }, [keyboardOpen, handleCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.backdrop} onPress={handleBackdropPress} />

        <View
          style={[
            styles.popup,
            {
              backgroundColor: isDark
                ? "rgba(30, 30, 30, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
            },
          ]}
        >
          <Box
            style={[
              styles.iconContainer,
              { backgroundColor: "rgba(59, 130, 246, 0.15)" },
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={32}
              color={theme.colors.primary[500]}
            />
          </Box>

          <Text size="lg" weight="bold" style={styles.title}>
            Age Verification
          </Text>

          <Text
            size="md"
            mode="subtle"
            weight="semibold"
            style={styles.message}
          >
            You must be 18 or older to view this content.
          </Text>

          <Text size="sm" mode="subtle" style={styles.description}>
            Please enter your date of birth. This is required by app store
            guidelines to restrict access to adult content for minors.
          </Text>

          <View style={styles.dobRow}>
            <View style={styles.dobField}>
              <Text
                size="xs"
                mode="subtle"
                weight="medium"
                style={styles.dobLabel}
              >
                Month
              </Text>
              <TextInput
                style={[
                  styles.dobInput,
                  {
                    color: theme.colors.text.default,
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.default,
                  },
                ]}
                value={month}
                onChangeText={(text) => {
                  setMonth(text);
                  if (text.length === 2) dayRef.current?.focus();
                }}
                onFocus={() => setKeyboardOpen(true)}
                onBlur={() => setKeyboardOpen(false)}
                placeholder="MM"
                placeholderTextColor={theme.colors.text.subtle}
                keyboardType="numeric"
                maxLength={2}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => dayRef.current?.focus()}
              />
            </View>
            <View style={styles.dobField}>
              <Text
                size="xs"
                mode="subtle"
                weight="medium"
                style={styles.dobLabel}
              >
                Day
              </Text>
              <TextInput
                ref={dayRef}
                style={[
                  styles.dobInput,
                  {
                    color: theme.colors.text.default,
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.default,
                  },
                ]}
                value={day}
                onChangeText={(text) => {
                  setDay(text);
                  if (text.length === 2) yearRef.current?.focus();
                }}
                onFocus={() => setKeyboardOpen(true)}
                onBlur={() => setKeyboardOpen(false)}
                placeholder="DD"
                placeholderTextColor={theme.colors.text.subtle}
                keyboardType="numeric"
                maxLength={2}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => yearRef.current?.focus()}
              />
            </View>
            <View style={[styles.dobField, { flex: 1.5 }]}>
              <Text
                size="xs"
                mode="subtle"
                weight="medium"
                style={styles.dobLabel}
              >
                Year
              </Text>
              <TextInput
                ref={yearRef}
                style={[
                  styles.dobInput,
                  {
                    color: theme.colors.text.default,
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.default,
                  },
                ]}
                value={year}
                onChangeText={(text) => {
                  setYear(text);
                  if (text.length === 4) handleVerify(text);
                }}
                onFocus={() => setKeyboardOpen(true)}
                onBlur={() => setKeyboardOpen(false)}
                placeholder="YYYY"
                placeholderTextColor={theme.colors.text.subtle}
                keyboardType="numeric"
                maxLength={4}
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
            </View>
          </View>

          {!!error && (
            <Text
              size="sm"
              style={[styles.error, { color: theme.colors.error[500] }]}
            >
              {error}
            </Text>
          )}

          <Box gap="sm" style={styles.buttons}>
            <Button
              size="lg"
              variant="outline"
              rounded="full"
              onPress={handleCancel}
              style={styles.button}
            >
              <Button.Text>Cancel</Button.Text>
            </Button>

            <Button
              size="lg"
              mode="brand"
              rounded="full"
              onPress={handleVerify}
              style={styles.button}
            >
              <Button.Text>Verify Age</Button.Text>
            </Button>
          </Box>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  popup: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xl,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  message: {
    textAlign: "center",
    marginBottom: theme.spacing.xs,
  },
  description: {
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  dobRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    width: "100%",
    marginBottom: theme.spacing.sm,
  },
  dobField: {
    flex: 1,
  },
  dobLabel: {
    marginBottom: 4,
    textAlign: "center",
  },
  dobInput: {
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
  error: {
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  buttons: {
    width: "100%",
    marginTop: theme.spacing.sm,
  },
  button: {
    width: "100%",
  },
}));
