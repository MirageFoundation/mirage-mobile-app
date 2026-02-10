import {
  RecoveryPhraseGrid,
} from "@/src/components/molecules";
import { Box, Button, Checkbox, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useAuthStore } from "@/src/stores";
import { apiClient } from "@/src/api/client";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommonActions } from "@react-navigation/native";
import { Image, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function RecoveryPhraseScreen() {
 const router = useRouter();
  const navigation = useNavigation();
 const params = useLocalSearchParams<{ username?: string }>();
  const { theme, rt } = useUnistyles();
  const isDark = rt.themeName === "dark";
  const insets = useSafeAreaInsets();

 const recoveryPhrase = useAuthStore((s) => s.recoveryPhrase);
 const confirmWalletCreation = useAuthStore((s) => s.confirmWalletCreation);

 const [hasSaved, setHasSaved] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const words = useMemo(() => {
    if (!recoveryPhrase) return [];
    return recoveryPhrase.split(" ");
  }, [recoveryPhrase]);

useEffect(() => {
    if (!recoveryPhrase && !isConfirming) {
      router.dismissTo("/(auth)/username");
    }
 }, [recoveryPhrase, isConfirming, router]);

  const handleCheckboxChange = useCallback(() => {
    triggerHaptic("selection");
    setHasSaved((prev) => !prev);
  }, []);

  const handleContinue = useCallback(async () => {
    if (!hasSaved) return;

    setIsConfirming(true);
    triggerHaptic("selection");

   try {
     // await confirmWalletCreation();
      await confirmWalletCreation();
      triggerHaptic("success");
     apiClient.setBaseUrl("https://mirage.vote");
      router.dismissAll();
    } catch (error) {
      console.error("[RecoveryPhrase] Failed to confirm wallet:", error);
      triggerHaptic("error");
    } finally {
      setIsConfirming(false);
    }
  }, [hasSaved, confirmWalletCreation, router]);

  if (words.length === 0) {
    return null;
  }

  return (
    <Box flex background="base">
      <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? 20 : insets.top }]}>
        <View style={styles.headerLeft} />
        <View style={styles.headerCenter}>
          <Image
            source={
              isDark
                ? require("@/assets/images/app-dark-icon.png")
                : require("@/assets/images/app-icon.png")
            }
            style={styles.appIcon}
            resizeMode="contain"
          />
        </View>
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
          <RecoveryPhraseGrid
            words={words}
            masked={false}
            showCopyButton={true}
          />
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
          disabled={!hasSaved || isConfirming}
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
  appIcon: {
    width: 28,
    height: 28,
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
