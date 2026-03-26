import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

type SearchHeaderProps = {
  topInset: number;
  query: string;
  isFocused: boolean;
  isSearching: boolean;
  inputRef: React.RefObject<TextInput | null>;
  textColor: string;
  subtleTextColor: string;
  lighterBackgroundColor: string;
  borderColor: string;
  primaryColor: string;
  backgroundColor: string;
  onBack: () => void;
  onChangeQuery: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
  onClear: () => void;
};

export function SearchHeader({
  topInset,
  query,
  isFocused,
  isSearching,
  inputRef,
  textColor,
  subtleTextColor,
  lighterBackgroundColor,
  borderColor,
  primaryColor,
  backgroundColor,
  onBack,
  onChangeQuery,
  onFocus,
  onBlur,
  onSubmit,
  onClear,
}: SearchHeaderProps) {
  const hasSearchQuery = query.trim().length > 0;

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + 8,
          backgroundColor,
          borderBottomColor: borderColor,
        },
      ]}
    >
      <Pressable onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
        <Ionicons name="arrow-back" size={24} color={textColor} />
      </Pressable>

      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: lighterBackgroundColor,
            borderColor: isFocused ? primaryColor : borderColor,
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={20}
          color={subtleTextColor}
          style={styles.searchIcon}
        />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onChangeQuery}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={onSubmit}
          placeholder="Search posts, topics, users..."
          placeholderTextColor={subtleTextColor}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: textColor }]}
        />
        {isSearching ? (
          <Animated.View entering={FadeIn.duration(100)}>
            <ActivityIndicator
              size="small"
              color={primaryColor}
              style={{ marginRight: 4 }}
            />
          </Animated.View>
        ) : null}
        {hasSearchQuery && !isSearching ? (
          <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
            <Pressable
              onPress={onClear}
              style={({ pressed }) => [styles.clearInputButton, pressed && { opacity: 0.5 }]}
            >
              <View style={[styles.clearInputIcon, { backgroundColor: subtleTextColor }]}>
                <Ionicons name="close" size={12} color={backgroundColor} />
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 0.5,
    gap: theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: theme.radius.xxl + 10,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: 17,
    paddingVertical: 0,
  },
  clearInputButton: {
    padding: 4,
  },
  clearInputIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
}));
