import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Box, Button, Checkbox, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  AUTH_EXIT_ROUTE,
  AUTH_USERNAME_ROUTE,
  resolveAuthSignupScreenAccess,
} from "@/src/navigation/auth-flow-policy";
import { exitAuthModal } from "@/src/navigation/auth-navigation";
import { useRouter } from "@/src/navigation/guarded-router";
import { trackEvent } from "@/src/services/analytics";
import { apiClient } from "@/src/api/client";
import { selectAuthSessionStatus, useAuthStore } from "@/src/stores/auth-store";
import { usePreferencesStore, getApiBaseUrl } from "@/src/stores";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSecretScreen } from "@/src/hooks/use-secret-screen";
import { copySecretWithExpiry } from "@/src/services/secret-screen";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { BackHandler, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function RecoveryPhraseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ username?: string }>();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const recoveryPhrase = useAuthStore((s) => s.recoveryPhrase);
  const hasConfirmedUsername = useAuthStore((s) => s.hasUsername);
  const protection = useSecretScreen();
  const locked = useRef(false);
  const mounted = useRef(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const sessionStatus = useAuthStore(selectAuthSessionStatus);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const confirmWalletCreation = useAuthStore((s) => s.confirmWalletCreation);

  const [hasSaved, setHasSaved] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const words = useMemo(
    () => (recoveryPhrase ? recoveryPhrase.split(" ").filter(Boolean) : []),
    [recoveryPhrase],
  );

  const access = resolveAuthSignupScreenAccess({
    screen: "recovery-phrase",
    sessionStatus,
    hasRecoveryPhrase: words.length > 0,
    hasConfirmedUsername,
    isCompletingSignup: isConfirming,
    isInitializing,
  });

  useEffect(() => {
    if (access !== "show") return;
    trackEvent("recovery_phrase_viewed");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (access !== "show") return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [access]);

  const handleCheckboxChange = useCallback(() => {
    if (!protection.isVisible()) return;
    triggerHaptic("selection");
    setHasSaved((prev) => !prev);
  }, [protection]);

  const handleContinue = useCallback(async () => {
    if (!hasSaved || locked.current || !protection.isVisible()) return;
    locked.current = true;
    const session = authSessionCoordinator.current();
    setIsConfirming(true);
    triggerHaptic("selection");

    try {
      await confirmWalletCreation(() => mounted.current && protection.isVisible());
      if (!mounted.current || !authSessionCoordinator.isCurrent(session)) return;
      triggerHaptic("success");
      const currentServer = usePreferencesStore.getState().apiServer;
      apiClient.setBaseUrl(getApiBaseUrl(currentServer));
      exitAuthModal();
    } catch {
      if (mounted.current && authSessionCoordinator.isCurrent(session)) {
        setErrorMessage("Unable to confirm this signup. Return to registration and check its status; your key is retained.");
        triggerHaptic("error");
        setIsConfirming(false);
      }
    } finally {
      locked.current = false;
      if (mounted.current) setIsConfirming(false);
    }
  }, [hasSaved, confirmWalletCreation, protection]);

  if (access === "redirect_home") {
    return <Redirect href={AUTH_EXIT_ROUTE} />;
  }

  if (access === "redirect_username") {
    return <Redirect href={AUTH_USERNAME_ROUTE} />;
  }

  if (words.length === 0) {
    return null;
  }

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "ios" ? 20 : insets.top },
        ]}
      >
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter} />
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <View style={styles.lockIcon}>
            <Ionicons
              name="shield-checkmark"
              size={32}
              color={theme.colors.brand[500]}
            />
          </View>
          <Text size="xl" weight="bold" style={{ textAlign: "center" }}>
            Save Your Recovery Phrase
          </Text>
          {params.username && (
            <Text size="sm" mode="subtle" style={{ marginTop: 4 }}>
              @{params.username}
            </Text>
          )}
        </View>

        <View style={styles.phraseContainer}>
          {protection.visible ? <>
            <RecoveryPhraseGrid words={words} showCopyButton={false} />
            <Button variant="ghost" onPress={async () => {
              try { await copySecretWithExpiry(words.join(" "), protection.isVisible); }
              catch { setErrorMessage("Unable to copy the recovery phrase."); }
            }}><Button.Text>Copy phrase (clears after 30 seconds)</Button.Text></Button>
          </> : <Button disabled={protection.protection !== "ready"} onPress={protection.reveal}>
            <Button.Text>{protection.protection === "unavailable" ? "Screen protection unavailable" : "Reveal recovery phrase"}</Button.Text>
          </Button>}
          {errorMessage && <Text size="sm" accessibilityRole="alert">{errorMessage}</Text>}
          {(errorMessage || protection.protection === "unavailable") && <Button variant="ghost" onPress={() => router.replace(AUTH_USERNAME_ROUTE)}>
            <Button.Text>Return to registration</Button.Text>
          </Button>}
        </View>

        <Pressable onPress={handleCheckboxChange} style={styles.checkboxRow}>
          <Checkbox
            checked={hasSaved}
            onChange={handleCheckboxChange}
            size="sm"
          />
          <Text
            size="sm"
            style={{ flex: 1, marginLeft: 8, color: theme.colors.text.subtle }}
          >
            I have saved my recovery phrase securely and understand I cannot
            recover my account without it
          </Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          size="lg"
          rounded="full"
          onPress={handleContinue}
          disabled={!hasSaved || isConfirming || !protection.visible}
          loading={isConfirming}
          style={{
            width: "100%",
            backgroundColor:
              !hasSaved || isConfirming
                ? theme.colors.background.subtle
                : theme.colors.primary[500],
          }}
        >
          <Button.Text
            style={{
              color:
                !hasSaved || isConfirming
                  ? theme.colors.text.subtle
                  : theme.colors.background.default,
            }}
            weight="medium"
          >
            Continue
          </Button.Text>
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
    paddingBottom: theme.spacing.sm,
  },
  headerLeft: {
    width: 44,
    height: 44,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    width: 44,
    height: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.subtle,
  },
}));
