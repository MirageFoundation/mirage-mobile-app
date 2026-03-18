import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Sentry from "@sentry/react-native";
import { BlurView } from "expo-blur";
import { useCallback, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type AgeVerificationModalProps = {
  visible: boolean;
  onVerified: () => void;
  onCancel: () => void;
};

const DEFAULT_DATE = new Date(2000, 0, 1);
const MIN_DATE = new Date(1900, 0, 1);
const MAX_DATE = new Date();

export function AgeVerificationModal({
  visible,
  onVerified,
  onCancel,
}: AgeVerificationModalProps) {
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";

  const [selectedDate, setSelectedDate] = useState(DEFAULT_DATE);
  const [error, setError] = useState("");
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const formatDate = (date: Date) => {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const verifyAge = useCallback(
    (date: Date) => {
      setError("");

      const today = new Date();
      let age = today.getFullYear() - date.getFullYear();
      const monthDiff = today.getMonth() - date.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < date.getDate())
      ) {
        age--;
      }

      if (age < 18) {
        setError("You are not eligible to view this content");
        Sentry.addBreadcrumb({
          category: "content_filter",
          message: "Age verification failed: underage",
          level: "warning",
        });
        return;
      }

      triggerHaptic("success");
      setSelectedDate(DEFAULT_DATE);
      onVerified();
    },
    [onVerified],
  );

  const handleDateChange = useCallback(
    (_event: any, date?: Date) => {
      if (Platform.OS === "android") {
        setShowAndroidPicker(false);
        if (_event.type === "dismissed") return;
      }
      if (date) {
        setSelectedDate(date);
        setError("");
      }
    },
    [],
  );

  const handleVerify = useCallback(() => {
    verifyAge(selectedDate);
  }, [selectedDate, verifyAge]);

  const handleCancel = useCallback(() => {
    triggerHaptic("light");
    setError("");
    setSelectedDate(DEFAULT_DATE);
    onCancel();
  }, [onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
        <Pressable style={styles.backdrop} onPress={handleCancel} />

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
            Please select your date of birth. This is required by app store
            guidelines to restrict access to adult content for minors.
          </Text>

          {Platform.OS === "android" ? (
            <>
              <Pressable
                onPress={() => setShowAndroidPicker(true)}
                style={[
                  styles.dateButton,
                  {
                    backgroundColor: theme.colors.background.subtle,
                    borderColor: theme.colors.border.default,
                  },
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={theme.colors.text.default}
                />
                <Text size="md" weight="semibold" style={{ marginLeft: 8 }}>
                  {formatDate(selectedDate)}
                </Text>
              </Pressable>
              {showAndroidPicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  maximumDate={MAX_DATE}
                  minimumDate={MIN_DATE}
                />
              )}
            </>
          ) : (
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={MAX_DATE}
              minimumDate={MIN_DATE}
              style={styles.picker}
              themeVariant={isDark ? "dark" : "light"}
            />
          )}

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
      </View>
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
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    marginBottom: theme.spacing.sm,
  },
  picker: {
    width: "100%",
    height: 150,
    marginBottom: theme.spacing.sm,
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
