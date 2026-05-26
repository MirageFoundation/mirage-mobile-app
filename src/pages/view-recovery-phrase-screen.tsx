import { RecoveryPhraseGrid } from "@/src/components/molecules";
import { Box, Text } from "@/src/components/ui/primitives";
import { walletService } from "@/src/services/wallet-service";
import * as Sentry from "@sentry/react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function ViewRecoveryPhraseScreen() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const phrase = await walletService.exportMnemonic();
        setMnemonic(phrase);
      } catch (error) {
        Sentry.captureException(error, { tags: { feature: "recovery-phrase", operation: "load" } });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const words = useMemo(() => {
    if (!mnemonic) return [];
    return mnemonic.split(" ");
  }, [mnemonic]);

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
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.brand[500]} />
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
                showCopyButton={true}
              />
            </View>
          </>
        ) : (
          <View style={styles.loadingContainer}>
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={theme.colors.text.subtle}
            />
            <Text size="md" mode="subtle" style={{ marginTop: 12 }}>
              Unable to load recovery phrase
            </Text>
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
}));
