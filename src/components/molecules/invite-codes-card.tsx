import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useInviteCodes } from "@/src/api/read/hooks";
import { usePreferencesStore } from "@/src/stores";

export function InviteCodesCard() {
 const { theme, rt } = useUnistyles();
const router = useRouter();
const { data: inviteCodesData, isLoading } = useInviteCodes();
const hideInviteCard = usePreferencesStore((s) => s.hideInviteCard);
const setHideInviteCard = usePreferencesStore((s) => s.setHideInviteCard);

 const isLightTheme = rt.themeName !== "dark";

  const availableCount = inviteCodesData?.available ?? 0;
const hasCodesLeft = availableCount > 0;

const handleSharePress = useCallback(() => {
    if (!hasCodesLeft) return;
    triggerHaptic("light");
    router.push("/invite-and-earn");
  }, [hasCodesLeft, router]);

  const handleHide = useCallback(() => {
    triggerHaptic("light");
    setHideInviteCard(true);
}, [setHideInviteCard]);

  if (hideInviteCard || isLoading) return null;

const subtitle = hasCodesLeft
    ? "Mirage is now invite-only — because great conversations require great people! But don't fret, we've given you some invite codes for your friends. Use them wisely."
    : "Mirage is now invite-only — because great conversations require great people! Unfortunately, you're out of invite codes. But don't worry, we might drop some more soon. Stay tuned!";

 return (
   <View
     style={[
       styles.container,
       {
         backgroundColor: theme.colors.background.default,
         borderColor: theme.colors.border.subtle,
       },
        isLightTheme && {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 4,
        },
     ]}
   >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="gift" size={22} color={theme.colors.brand[500]} />
          <Text size="lg" weight="semibold">
            Invite Codes
          </Text>
        </View>
        <Pressable
          onPress={handleHide}
          hitSlop={8}
          style={({ pressed }) => [
            styles.hideButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="close" size={22} color={theme.colors.text.subtle} />
        </Pressable>
      </View>

     <Text size="md" mode="subtle" style={styles.subtitle}>
       {subtitle}
     </Text>

      {hasCodesLeft ? (
        <Pressable
          onPress={handleSharePress}
          style={({ pressed }) => [
            styles.gradientButtonContainer,
            pressed && { opacity: 0.9 },
          ]}
        >
          <LinearGradient
            colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientButton}
          >
            <Text size="md" weight="semibold" style={{ color: "#FFFFFF" }}>
              Share Invite Code ({availableCount} left)
            </Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <View
          style={[
            styles.button,
            { backgroundColor: theme.colors.background.subtle },
          ]}
        >
          <Text
            size="md"
            weight="semibold"
            style={{ color: theme.colors.text.subtle }}
          >
            No Codes Left
          </Text>
        </View>
      )}
   </View>
 );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBlock: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  hideButton: {
    // padding: theme.spacing.xs,
  },
  subtitle: {
    marginBottom: theme.spacing.sm + 4,
    lineHeight: 18,
  },
 button: {
   paddingVertical: theme.spacing.sm + 4,
   paddingHorizontal: theme.spacing.md,
   borderRadius: theme.radius.md,
   alignItems: "center",
 },
  gradientButtonContainer: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  gradientButton: {
    paddingVertical: theme.spacing.sm + 4,
    paddingHorizontal: theme.spacing.md,
    alignItems: "center",
  },
}));
