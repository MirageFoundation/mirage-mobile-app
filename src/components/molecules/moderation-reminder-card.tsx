import { Ionicons } from "@expo/vector-icons";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type ModerationReminderCardProps = {
  onChooseAgents: () => void;
  onUnderstand: () => void;
  onRemindLater: () => void;
};

export function ModerationReminderCard({
  onChooseAgents,
  onUnderstand,
  onRemindLater,
}: ModerationReminderCardProps) {
  const { theme } = useUnistyles();

  const handleChooseAgents = useCallback(() => {
    triggerHaptic("light");
    onChooseAgents();
  }, [onChooseAgents]);

  const handleUnderstand = useCallback(() => {
    triggerHaptic("selection");
    onUnderstand();
  }, [onUnderstand]);

  const handleRemindLater = useCallback(() => {
    triggerHaptic("selection");
    onRemindLater();
  }, [onRemindLater]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: `${theme.colors.error[500]}10`,
          borderColor: `${theme.colors.error[500]}40`,
        },
      ]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: `${theme.colors.error[500]}20`,
              borderColor: `${theme.colors.error[500]}40`,
            },
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={22}
            color={theme.colors.error[500]}
          />
        </View>
        <View style={styles.titleContent}>
          <Text size="md" weight="semibold">
            Mirage moderation is opt-in
          </Text>
          <Text size="xs" mode="subtle" style={styles.subtitle}>
            Choose agents to clean up your feed
          </Text>
        </View>
      </View>

      <Text size="sm" mode="subtle" style={styles.description}>
        Mirage does not hide legal content by default just because it is messy,
        spammy, offensive, or low quality. If your feed feels too unruly, enable
        moderation agents — each one filters a specific kind of unwanted
        content. For example, SafeSpaceBot rewrites hostile posts into kinder
        language, and AntiSpamBot hides spam and low-effort posts. Mix and match
        as many as you like.
      </Text>

      <View style={styles.actions}>
        <Button
          size="md"
          rounded="lg"
          mode="error"
          onPress={handleChooseAgents}
        >
          <Button.Text weight="semibold">Choose agents</Button.Text>
        </Button>

        <View style={styles.secondaryActions}>
          <Pressable
            onPress={handleUnderstand}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: `${theme.colors.error[500]}12`,
                borderColor: `${theme.colors.error[500]}35`,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              size="sm"
              weight="semibold"
              style={{ color: theme.colors.error[500] }}
            >
              I understand
            </Text>
          </Pressable>

          <Pressable
            onPress={handleRemindLater}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: `${theme.colors.error[500]}12`,
                borderColor: `${theme.colors.error[500]}35`,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              size="sm"
              weight="semibold"
              style={{ color: theme.colors.error[500] }}
            >
              Remind me later
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    padding: theme.spacing.md,
    borderBottomWidth: 0.5,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  titleContent: {
    flex: 1,
  },
  subtitle: {
    marginTop: 2,
  },
  description: {
    marginTop: theme.spacing.md,
    lineHeight: 20,
  },
  actions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },
}));
