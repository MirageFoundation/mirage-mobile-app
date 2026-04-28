import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import Animated, {
  FadeOut,
  SlideInDown,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { Feather } from "@expo/vector-icons";

interface MentionUser {
  username: string;
  address: string;
}

interface MentionSuggestionsProps {
  visible: boolean;
  loading: boolean;
  results: MentionUser[];
  query: string;
  onSelect: (username: string) => void;
  onClose: () => void;
}

export function MentionSuggestions({
  visible,
  loading,
  results,
  query,
  onSelect,
  onClose,
}: MentionSuggestionsProps) {
  const { theme } = useUnistyles();

  if (!visible) return null;

  const hasResults = results.length > 0;

  return (
    <Animated.View
      entering={SlideInDown.duration(250).damping(20).stiffness(180)}
      exiting={FadeOut.duration(120)}
      style={styles.container}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.background.default,
            borderColor: theme.colors.border.subtle,
            shadowColor: "#000",
          },
        ]}
      >
        <View style={styles.handleBar}>
          <View
            style={[
              styles.handle,
              { backgroundColor: theme.colors.border.default },
            ]}
          />
        </View>

        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.border.subtle },
          ]}
        >
          <View style={styles.headerLeft}>
            <Text
              size="sm"
              weight="bold"
              style={{ color: theme.colors.text.default }}
            >
              Results for
            </Text>
            <View
              style={[
                styles.queryBadge,
                { backgroundColor: theme.colors.brand[500] + "15" },
              ]}
            >
              <Text
                size="xs"
                weight="semibold"
                style={{ color: theme.colors.brand[500] }}
              >
                @{query || ""}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather
              name="x"
              size={18}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </View>

        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={hasResults}
        >
          {!query && (
            <View style={styles.hintRow}>
              <Text size="sm" mode="subtle">
                Type a username after @
              </Text>
            </View>
          )}

          {loading && !hasResults && query.length > 0 && (
            <View style={styles.hintRow}>
              <ActivityIndicator
                size="small"
                color={theme.colors.brand[500]}
              />
              <Text size="sm" mode="subtle">
                Searching...
              </Text>
            </View>
          )}

          {!loading && !hasResults && query.length > 0 && (
            <View style={styles.hintRow}>
              <Feather
                name="user-x"
                size={14}
                color={theme.colors.text.subtle}
              />
              <Text size="sm" mode="subtle">
                No users found
              </Text>
            </View>
          )}

          {loading && hasResults && (
            <View style={styles.hintRow}>
              <ActivityIndicator
                size="small"
                color={theme.colors.brand[500]}
              />
              <Text size="sm" mode="subtle">
                Searching...
              </Text>
            </View>
          )}

          {results.map((item, index) => (
            <Pressable
              key={item.username}
              style={({ pressed }) => [
                styles.item,
                index < results.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.colors.border.subtle,
                },
                pressed && {
                  backgroundColor: theme.colors.background.hover,
                },
              ]}
              onPress={() => onSelect(item.username)}
            >
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.colors.brand[500] + "18" },
                  ]}
                >
                  <Text
                    size="xs"
                    weight="bold"
                    style={{ color: theme.colors.brand[500] }}
                  >
                    {item.username[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.itemText}>
                  <Text
                    size="sm"
                    weight="semibold"
                    style={{ color: theme.colors.text.default }}
                  >
                    @{item.username}
                  </Text>
                  {item.address ? (
                    <Text size="xs" mode="subtle" numberOfLines={1}>
                      {item.address.slice(0, 8)}…{item.address.slice(-4)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Feather
                name="arrow-up-left"
                size={16}
                color={theme.colors.text.subtle}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {},
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  queryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  list: {
    maxHeight: 260,
  },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  itemText: {
    flex: 1,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
}));
