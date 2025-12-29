import { WordChip } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
  const [masked] = useState(initialMasked);
  const [copied, setCopied] = useState(false);

  // Animation values for icon and text - simplified for performance
  const iconScale = useRef(new Animated.Value(1)).current;
  const textScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (copied) {
      // Quick scale animation for both icon and text
      Animated.parallel([
        Animated.sequence([
          Animated.timing(iconScale, {
            toValue: 1.15,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(iconScale, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(textScale, {
            toValue: 1.15,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(textScale, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    } else {
      // Reset animations quickly
      Animated.parallel([
        Animated.timing(iconScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(textScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [copied, iconScale, textScale]);

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
  const rows = [words.slice(0, 4), words.slice(4, 8), words.slice(8, 12)];

  return (
    <View style={styles.container}>
      {/* Warning banner */}
      <View style={styles.warningBanner}>
        <Ionicons name="warning" size={18} color={theme.colors.warning[500]} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text
            size="sm"
            weight="semibold"
            style={{ color: theme.colors.warning[500], marginBottom: 4 }}
          >
            Important: Below Is Your Recovery Phrase.
          </Text>
          <Text size="xs" style={{ color: theme.colors.warning[500] }}>
            This 12-word phrase is the ONLY way to recover your account. Write
            it down and store it safely offline. Anyone with this phrase can
            access your account!
          </Text>
        </View>
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

      {/* Copy button */}
      {showCopyButton && (
        <View
          style={[
            styles.copyButtonContainer,
            {
              backgroundColor: copied
                ? `${theme.colors.success[500]}15`
                : theme.colors.background.subtle,
              borderColor: copied
                ? theme.colors.success[500]
                : theme.colors.border.subtle,
            },
          ]}
        >
          <Pressable onPress={handleCopy} style={styles.copyButton}>
            <Animated.View
              style={{
                transform: [{ scale: iconScale }],
              }}
            >
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={18}
                color={
                  copied ? theme.colors.success[500] : theme.colors.text.default
                }
              />
            </Animated.View>
            <Animated.View
              style={{
                transform: [{ scale: textScale }],
                marginLeft: 8,
              }}
            >
              <Text
                size="sm"
                weight="semibold"
                style={{
                  color: copied
                    ? theme.colors.success.base
                    : theme.colors.text.default,
                }}
              >
                {copied ? "Copied!" : "Copy Phrase"}
              </Text>
            </Animated.View>
          </Pressable>
        </View>
      )}
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
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: `${theme.colors.warning[500]}30`,
  },
  grid: {
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.background.base,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border.default,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  copyButtonContainer: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  copyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
}));
