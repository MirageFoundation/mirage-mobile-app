import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type SettingSectionProps = {
  /** Section title */
  title: string;
  /** Children components (SettingRow items) */
  children: React.ReactNode;
};

export function SettingSection({ title, children }: SettingSectionProps) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.colors.background.subtle },
        ]}
      >
        <Text size="xs" weight="semibold" mode="subtle" style={styles.title}>
          {title.toUpperCase()}
        </Text>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    marginBottom: theme.spacing.sm,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  title: {
    letterSpacing: 0.5,
  },
  content: {
    backgroundColor: theme.colors.background.default,
  },
}));
