import { WordChip } from "@/src/components/atoms";
import { Button, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { applyPhraseInput, resizePhraseInput, PHRASE_WORD_COUNTS } from "@/src/domain/auth/phrase-input";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type RecoveryPhraseInputProps = {
  /** Empty strings represent unfilled words. */
  words: string[];
  /** Callback when words change */
  onWordsChange: (words: string[]) => void;
  /** Validation errors per word index */
  errors?: Record<number, boolean>;
  /** Callback when all words are entered */
  onComplete?: () => void;
  onInputError?: (message: string | null) => void;
};

export const RecoveryPhraseInput = ({
  words,
  onWordsChange,
  errors = {},
  onComplete,
  onInputError,
}: RecoveryPhraseInputProps) => {
  const { theme } = useUnistyles();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const reportInputError = useCallback((message: string | null) => {
    setInputError(message);
    onInputError?.(message);
  }, [onInputError]);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);

  const handleWordChange = useCallback((index: number, text: string) => {
    generation.current += 1;
    const result = applyPhraseInput(words, index, text);
    reportInputError(result.error ?? null);
    if (result.error) return;
    onWordsChange(result.words);
    if (result.words.every(Boolean)) onComplete?.();
  }, [words, onWordsChange, onComplete, reportInputError]);

  const handlePaste = useCallback(async () => {
    const request = ++generation.current;
    try {
      const clipboardText = await Clipboard.getStringAsync();
      if (request !== generation.current || AppState.currentState !== "active") return;
      const firstEmpty = words.findIndex((word) => !word);
      handleWordChange(firstEmpty < 0 ? 0 : firstEmpty, clipboardText);
    } catch {
      if (request === generation.current && AppState.currentState === "active") reportInputError("Clipboard unavailable. Enter the words manually.");
    }
  }, [words, handleWordChange, reportInputError]);

  const handleClear = useCallback(() => {
    generation.current += 1;
    triggerHaptic("selection");
    reportInputError(null);
    onWordsChange(Array(words.length).fill(""));
  }, [onWordsChange, words.length, reportInputError]);

  const rows = Array.from({ length: Math.ceil(words.length / 4) }, (_, index) => words.slice(index * 4, index * 4 + 4));

  const filledCount = words.filter((w) => w.length > 0).length;

  return (
    <View style={styles.container}>
      {/* Header with paste button */}
      <View style={styles.header}>
        <Text size="sm" style={{ color: theme.colors.neutral[600] }}>
          Enter your {words.length}-word recovery phrase
        </Text>
        <Button size="sm" variant="ghost" onPress={handlePaste}>
          <Button.Icon>
            {({ color, size }) => (
              <MaterialCommunityIcons
                name="clipboard-multiple-outline"
                size={size}
                color={color}
              />
            )}
          </Button.Icon>
          <Button.Text>Paste</Button.Text>
        </Button>
      </View>

      <View style={[styles.row, { flexWrap: "wrap" }]}>
        {PHRASE_WORD_COUNTS.map((count) => (
          <Button key={count} size="sm" variant={words.length === count ? "outline" : "ghost"} onPress={() => {
            generation.current += 1;
            const result = resizePhraseInput(words, count);
            reportInputError(result.error ?? null);
            if (!result.error) onWordsChange(result.words);
          }}><Button.Text>{count} words</Button.Text></Button>
        ))}
      </View>
      {inputError && <Text size="sm" accessibilityRole="alert">{inputError}</Text>}
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
              { width: `${(filledCount / words.length) * 100}%` },
            ]}
          />
        </View>
        <Text size="xs" style={{ color: theme.colors.neutral[600] }}>
          {filledCount}/{words.length} words
        </Text>
        {filledCount > 0 && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Ionicons
              name="close-circle"
              size={16}
              color={theme.colors.text.subtle}
            />
            <Text size="xs" style={{ color: theme.colors.neutral[600], marginLeft: 4 }}>
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
    height: 2,
    backgroundColor: theme.colors.background.emphasis,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: 3,
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
