import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useMemo } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useRecoveryPhraseDisclosure } from "./recovery-phrase/use-recovery-phrase-disclosure";

export function ViewRecoveryPhraseScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const {
    snapshot,
    errorMessage,
    captureProtection,
    copied,
    reveal,
    copy,
  } = useRecoveryPhraseDisclosure();

  const words = useMemo(() => {
    if (!snapshot.phrase) return [];
    return snapshot.phrase.split(" ");
  }, [snapshot.phrase]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: Platform.OS === "ios" ? insets.top : 48,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Recovery Phrase
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {captureProtection === "checking" ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.brand[500]} />
            <Text size="sm" mode="subtle" style={styles.statusText}>
              Securing this screen...
            </Text>
          </View>
        ) : words.length > 0 ? (
          <>
            <View style={styles.titleSection}>
              <View style={styles.lockIcon}>
                <Ionicons
                  name="shield-checkmark"
                  size={32}
                  color={theme.colors.brand[500]}
                />
              </View>
              <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
                Your Recovery Phrase
              </Text>
              <Text
                size="sm"
                mode="subtle"
                style={{ textAlign: "center", marginTop: 4 }}
              >
                Keep this phrase safe. Anyone with access to it can control your
                account.
              </Text>
            </View>

            <View style={styles.phraseContainer}>
              <RecoveryPhraseGrid
                words={words}
                masked={false}
                showCopyButton={false}
              />
              <Pressable
                onPress={() => void copy()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={18}
                  color="#FFFFFF"
                />
                <Text size="sm" weight="semibold" style={styles.buttonText}>
                  {copied ? "Copied" : "Copy Phrase"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <Ionicons
              name={captureProtection === "ready" ? "lock-closed" : "alert-circle-outline"}
              size={48}
              color={
                captureProtection === "ready"
                  ? theme.colors.brand[500]
                  : theme.colors.text.subtle
              }
            />
            <Text size="lg" weight="semibold" style={styles.statusText}>
              {captureProtection === "ready"
                ? "Authentication required"
                : "Recovery phrase unavailable"}
            </Text>
            <Text size="sm" mode="subtle" style={styles.explanationText}>
              {captureProtection === "ready"
                ? "Authenticate with your device to reveal the phrase. It will be hidden again after one minute."
                : "This device cannot securely protect the recovery phrase screen."}
            </Text>
            {errorMessage ? (
              <Text size="sm" style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}
            {captureProtection === "ready" ? (
              <Pressable
                disabled={snapshot.phase === "authenticating" || snapshot.phase === "exporting"}
                onPress={() => void reveal()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                {snapshot.phase === "authenticating" || snapshot.phase === "exporting" ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="finger-print" size={20} color="#FFFFFF" />
                )}
                <Text size="sm" weight="semibold" style={styles.buttonText}>
                  {snapshot.phase === "authenticating"
                    ? "Authenticating..."
                    : snapshot.phase === "exporting"
                      ? "Loading..."
                      : "Authenticate to Reveal"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    marginTop: -20,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  titleSection: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: `${theme.colors.brand[500]}15`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.md,
  },
  phraseContainer: {
    marginBottom: theme.spacing.md,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  statusText: {
    marginTop: 12,
    textAlign: "center",
  },
  explanationText: {
    marginTop: 8,
    maxWidth: 320,
    textAlign: "center",
  },
  errorText: {
    color: theme.colors.error[500],
    marginTop: theme.spacing.md,
    maxWidth: 320,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: theme.colors.brand[500],
    borderRadius: theme.radius.md,
    flexDirection: "row",
    gap: theme.spacing.sm,
    justifyContent: "center",
    marginTop: theme.spacing.md,
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#FFFFFF",
  },
}));
