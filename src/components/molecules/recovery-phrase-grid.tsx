import { useCallback, useState } from "react";
import { View, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { WordChip } from "@/src/components/atoms";
import { Box, Text, Button } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type RecoveryPhraseGridProps = {
  /** Array of 12 recovery phrase words */
  words: string[];
  /** Whether to initially mask the words */
  masked?: boolean;
  /** Whether to show the copy button */
  showCopyButton?: boolean;
  /** Callback when copy is pressed */
  onCopy?: () => void;
};

export const RecoveryPhraseGrid = ({
  words,
  masked: initialMasked = false,
  showCopyButton = true,
  onCopy,
}: RecoveryPhraseGridProps) => {
  const { theme } = useUnistyles();
  const [masked, setMasked] = useState(initialMasked);
  const [copied, setCopied] = useState(false);

  const handleToggleMask = useCallback(() => {
    triggerHaptic("selection");
    setMasked((prev) => !prev);
  }, []);

  const handleCopy = useCallback(async () => {
    triggerHaptic("success");
    const phrase = words.join(" ");
    await Clipboard.setStringAsync(phrase);
    setCopied(true);
    onCopy?.();

    // Reset copied state after 2 seconds
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [words, onCopy]);

  // Split words into rows of 4
  const rows = [
    words.slice(0, 4),
    words.slice(4, 8),
    words.slice(8, 12),
  ];

  return (
    <View style={styles.container}>
      {/* Warning banner */}
      <View style={styles.warningBanner}>
        <Ionicons
          name="warning"
          size={18}
          color={theme.colors.warning[500]}
        />
        <Text size="xs" style={{ color: theme.colors.warning[500], flex: 1, marginLeft: 8 }}>
          Write down these 12 words in order. This is the ONLY way to recover your account.
        </Text>
      </View>

      {/* Word grid */}
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((word, colIndex) => {
              const wordIndex = rowIndex * 4 + colIndex + 1;
              return (
                <WordChip
                  key={wordIndex}
                  word={word}
                  index={wordIndex}
                  masked={masked}
                  editable={false}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        {/* Toggle visibility */}
        <Pressable onPress={handleToggleMask} style={styles.toggleButton}>
          <Ionicons
            name={masked ? "eye-off-outline" : "eye-outline"}
            size={18}
            color={theme.colors.text.subtle}
          />
          <Text size="xs" mode="subtle" style={{ marginLeft: 6 }}>
            {masked ? "Show" : "Hide"}
          </Text>
        </Pressable>

        {/* Copy button */}
        {showCopyButton && (
          <Button
            size="sm"
            variant="outline"
            rounded="lg"
            onPress={handleCopy}
            style={styles.copyButton}
          >
            <Button.Icon>
              {({ color, size }) => (
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={size}
                  color={copied ? theme.colors.success[500] : color}
                />
              )}
            </Button.Icon>
            <Button.Text
              style={copied ? { color: theme.colors.success[500] } : undefined}
            >
              {copied ? "Copied!" : "Copy All"}
            </Button.Text>
          </Button>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing.md,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: `${theme.colors.warning[500]}15`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: `${theme.colors.warning[500]}30`,
  },
  grid: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.background.subtle,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  copyButton: {
    minWidth: 110,
  },
}));

