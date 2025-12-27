import { useState, useRef } from "react";
import { View, TextInput, Pressable, Animated } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

type WordChipProps = {
  /** The recovery phrase word */
  word?: string;
  /** Index of the word (1-12) */
  index: number;
  /** Whether the chip is editable (for input mode) */
  editable?: boolean;
  /** Callback when text changes (editable mode) */
  onChangeText?: (text: string) => void;
  /** Callback when the chip is focused (editable mode) */
  onFocus?: () => void;
  /** Callback when the chip loses focus (editable mode) */
  onBlur?: () => void;
  /** Whether to mask/hide the word */
  masked?: boolean;
  /** Error state */
  error?: boolean;
  /** Whether the chip is highlighted/selected */
  highlighted?: boolean;
};

export const WordChip = ({
  word = "",
  index,
  editable = false,
  onChangeText,
  onFocus,
  onBlur,
  masked = false,
  error = false,
  highlighted = false,
}: WordChipProps) => {
  const { theme } = useUnistyles();
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();
    Animated.spring(scale, {
      toValue: 1.02,
      useNativeDriver: true,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (editable) {
      triggerHaptic("selection");
      inputRef.current?.focus();
    }
  };

  const displayWord = masked && word ? "•".repeat(word.length) : word;

  styles.useVariants({ 
    editable, 
    focused: isFocused, 
    error, 
    highlighted,
    hasValue: word.length > 0,
  });

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <Pressable onPress={handlePress} style={styles.container}>
        {/* Index number */}
        <View style={styles.indexContainer}>
          <Text size="xs" mode="subtle" weight="medium">
            {index}
          </Text>
        </View>

        {/* Word content */}
        <View style={styles.wordContainer}>
          {editable ? (
            <TextInput
              ref={inputRef}
              value={word}
              onChangeText={onChangeText}
              onFocus={handleFocus}
              onBlur={handleBlur}
              style={[
                styles.input,
                { color: theme.colors.text.default },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              placeholder="..."
              placeholderTextColor={theme.colors.text.subtle}
              selectionColor={theme.colors.primary[500]}
            />
          ) : (
            <Text 
              size="sm" 
              weight="medium"
              style={masked && word ? { letterSpacing: 2 } : undefined}
            >
              {displayWord || "—"}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  wrapper: {
    flex: 1,
    minWidth: 70,
    maxWidth: 100,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background.subtle,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    overflow: "hidden",
    variants: {
      editable: {
        true: {},
        false: {},
      },
      focused: {
        true: {
          borderColor: theme.colors.primary[500],
          borderWidth: 2,
        },
        false: {},
      },
      error: {
        true: {
          borderColor: theme.colors.error[500],
          backgroundColor: `${theme.colors.error[500]}10`,
        },
        false: {},
      },
      highlighted: {
        true: {
          borderColor: theme.colors.success[500],
          backgroundColor: `${theme.colors.success[500]}10`,
        },
        false: {},
      },
      hasValue: {
        true: {},
        false: {},
      },
    },
  },
  indexContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: theme.colors.border.subtle,
    height: "100%",
  },
  wordContainer: {
    flex: 1,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontFamily: theme.typography.family.mono,
    fontSize: theme.typography.size.sm,
    padding: 0,
    margin: 0,
  },
}));

