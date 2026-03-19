import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "@/src/hooks/use-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { useInviteCodes } from "@/src/api/read/hooks";
import { usePreferencesStore } from "@/src/stores";

export function InviteCodesCard() {
  const { theme, rt } = useUnistyles();
  const router = useRouter();
  const { data: inviteCodesData, isLoading } = useInviteCodes();
  const inviteCardExpanded = usePreferencesStore((s) => s.inviteCardExpanded);
  const setInviteCardExpanded = usePreferencesStore((s) => s.setInviteCardExpanded);

  const isLightTheme = rt.themeName !== "dark";

  const rotation = useDerivedValue(() => {
    return withTiming(inviteCardExpanded ? 0 : 180, { duration: 200 });
  }, [inviteCardExpanded]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const availableCount = inviteCodesData?.available ?? 0;
  const hasCodesLeft = availableCount > 0;

  const handleSharePress = useCallback(() => {
    if (!hasCodesLeft) return;
    triggerHaptic("light");
    router.push("/invite-and-earn");
  }, [hasCodesLeft, router]);

  const handleToggleExpand = useCallback(() => {
    triggerHaptic("light");
    setInviteCardExpanded(!inviteCardExpanded);
  }, [inviteCardExpanded, setInviteCardExpanded]);

  if (isLoading) return null;

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
      <Pressable onPress={handleToggleExpand} style={styles.header}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.brand[500] + "20" },
            ]}
          >
            <Ionicons name="gift" size={18} color={theme.colors.brand[500]} />
          </View>
          <View style={styles.titleContent}>
            <Text size="md" weight="semibold">
              Invite Codes
            </Text>
            <Text size="xs" mode="subtle">
              {hasCodesLeft ? `${availableCount} codes available` : "No codes left"}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {hasCodesLeft && (
            <View
              style={[
                styles.countBadge,
                { backgroundColor: theme.colors.brand[500] + "20" },
              ]}
            >
              <Text size="xs" weight="bold" style={{ color: theme.colors.brand[500] }}>
                {availableCount}
              </Text>
            </View>
          )}
          <Animated.View style={chevronStyle}>
            <Ionicons
              name="chevron-up"
              size={20}
              color={theme.colors.text.subtle}
            />
          </Animated.View>
        </View>
      </Pressable>

      {inviteCardExpanded && (
        <View style={styles.content}>
          <Text size="sm" mode="subtle" style={styles.subtitle}>
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
                <Text size="sm" weight="semibold" style={{ color: "#FFFFFF" }}>
                  Share Invite Code
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
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
                size="sm"
                weight="semibold"
                style={{ color: theme.colors.text.subtle }}
              >
                No Codes Left
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContent: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  subtitle: {
    lineHeight: 18,
  },
  button: {
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  gradientButtonContainer: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
  },
  gradientButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
  },
}));
