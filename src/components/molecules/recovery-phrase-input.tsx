import { WordChip } from "@/src/components/atoms";
import { Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type RecoveryPhraseInputProps = {
  /** Current words array (12 items, empty strings for unfilled) */
  words: string[];
  /** Callback when words change */
  onWordsChange: (words: string[]) => void;
  /** Validation errors per word index */
  errors?: Record<number, boolean>;
  /** Callback when all words are entered */
  onComplete?: () => void;
};

export const RecoveryPhraseInput = ({
  words,
  onWordsChange,
  errors = {},
  onComplete,
}: RecoveryPhraseInputProps) => {
  const { theme } = useUnistyles();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleWordChange = useCallback(
    (index: number, text: string) => {
      // Handle paste of full phrase
      const trimmedText = text.trim();
      const pastedWords = trimmedText.split(/\s+/);

      if (pastedWords.length > 1) {
        // User pasted multiple words - fill in from current index
        const newWords = [...words];
        pastedWords.forEach((word, i) => {
          const targetIndex = index + i;
          if (targetIndex < 12) {
            newWords[targetIndex] = word.toLowerCase();
          }
        });
        onWordsChange(newWords);
        triggerHaptic("success");

        // Focus the next empty slot or last filled slot
        const nextEmptyIndex = newWords.findIndex((w) => !w);
        if (nextEmptyIndex !== -1 && nextEmptyIndex < 12) {
          inputRefs.current[nextEmptyIndex]?.focus();
        } else {
          // All filled, check if complete
          if (newWords.every((w) => w.length > 0)) {
            onComplete?.();
          }
        }
        return;
      }

      // Single word entry
      const newWords = [...words];
      newWords[index] = text.toLowerCase().replace(/[^a-z]/g, "");
      onWordsChange(newWords);
    },
    [words, onWordsChange, onComplete]
  );

  const handleWordSubmit = useCallback(
    (index: number) => {
      // Move to next input
      if (index < 11) {
        inputRefs.current[index + 1]?.focus();
      } else {
        // Last word, blur and trigger complete if all filled
        inputRefs.current[index]?.blur();
        if (words.every((w) => w.length > 0)) {
          onComplete?.();
        }
      }
    },
    [words, onComplete]
  );

  const handlePaste = useCallback(async () => {
    try {
      const clipboardText = await Clipboard.getStringAsync();
      const pastedWords = clipboardText.trim().split(/\s+/);

      if (pastedWords.length === 12) {
        triggerHaptic("success");
        onWordsChange(pastedWords.map((w) => w.toLowerCase()));
        onComplete?.();
      } else if (pastedWords.length > 0) {
        triggerHaptic("warning");
        // Partial paste from first empty slot
        const firstEmptyIndex = words.findIndex((w) => !w);
        const startIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;

        const newWords = [...words];
        pastedWords.forEach((word, i) => {
          const targetIndex = startIndex + i;
          if (targetIndex < 12) {
            newWords[targetIndex] = word.toLowerCase();
          }
        });
        onWordsChange(newWords);
      }
    } catch (error) {
      // Clipboard access failed
      triggerHaptic("error");
    }
  }, [words, onWordsChange, onComplete]);

  const handleClear = useCallback(() => {
    triggerHaptic("selection");
    onWordsChange(Array(12).fill(""));
    inputRefs.current[0]?.focus();
  }, [onWordsChange]);

  // Split words into rows of 4
  const rows = [words.slice(0, 4), words.slice(4, 8), words.slice(8, 12)];

  const filledCount = words.filter((w) => w.length > 0).length;

  return (
    <View style={styles.container}>
      {/* Header with paste button */}
      <View style={styles.header}>
        <Text size="sm" mode="subtle">
          Enter your 12-word recovery phrase
        </Text>
        <Button size="sm" variant="ghost" onPress={handlePaste}>
          <Button.Icon>
            {({ color, size }) => (
              <Ionicons name="clipboard-outline" size={size} color={color} />
            )}
          </Button.Icon>
          <Button.Text>Paste</Button.Text>
        </Button>
      </View>

      {/* Word grid */}
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((word, colIndex) => {
              const wordIndex = rowIndex * 4 + colIndex;
              const absoluteIndex = wordIndex;
              return (
                <WordChip
                  key={wordIndex}
                  word={word}
                  index={absoluteIndex + 1}
                  editable
                  onChangeText={(text) => handleWordChange(absoluteIndex, text)}
                  onFocus={() => setFocusedIndex(absoluteIndex)}
                  onBlur={() => setFocusedIndex(null)}
                  error={errors[absoluteIndex]}
                  highlighted={focusedIndex === absoluteIndex}
                />
              );
            })}
          </View>
        ))}
      </View>

      {/* Footer with progress and clear */}
      <View style={styles.footer}>
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              { width: `${(filledCount / 12) * 100}%` },
            ]}
          />
        </View>
        <Text size="xs" mode="subtle">
          {filledCount}/12 words
        </Text>
        {filledCount > 0 && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Ionicons
              name="close-circle"
              size={16}
              color={theme.colors.text.subtle}
            />
            <Text size="xs" mode="subtle" style={{ marginLeft: 4 }}>
              Clear
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  progressContainer: {
    flex: 1,
    height: 4,
    backgroundColor: theme.colors.background.emphasis,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: theme.colors.success[500],
    borderRadius: 2,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
}));
