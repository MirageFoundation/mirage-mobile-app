import { Feather, Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import { MEME_STICKERS } from "@/src/data/stickers";

const NUM_COLUMNS = 3;
const SPACING = 8;
const screenWidth = Dimensions.get("window").width;
const ITEM_SIZE = (screenWidth - SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

type StickerPickerProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (urls: string[]) => void;
  selectedStickers: string[];
  multiSelect?: boolean;
};

export function StickerPicker({
  visible,
  onClose,
  onSelect,
  selectedStickers,
  multiSelect = true,
}: StickerPickerProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();

  const handleToggle = useCallback(
    (url: string) => {
      triggerHaptic("selection");
      if (multiSelect) {
        const isSelected = selectedStickers.includes(url);
        if (isSelected) {
          onSelect(selectedStickers.filter((s) => s !== url));
        } else {
          onSelect([...selectedStickers, url]);
        }
      } else {
        const isSelected = selectedStickers.includes(url);
        if (isSelected) {
          onSelect([]);
        } else {
          onSelect([url]);
          onClose();
        }
      }
    },
    [multiSelect, selectedStickers, onSelect, onClose],
  );

  const handleDone = useCallback(() => {
    triggerHaptic("medium");
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: string }) => {
      const isSelected = selectedStickers.includes(item);
      return (
        <Pressable onPress={() => handleToggle(item)} style={styles.item}>
          <Image
            source={{ uri: item }}
            style={[
              styles.stickerImage,
              isSelected && {
                borderColor: theme.colors.brand[500],
                borderWidth: 3,
              },
            ]}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          {isSelected && (
            <View
              style={[
                styles.checkBadge,
                { backgroundColor: theme.colors.brand[500] },
              ]}
            >
              <Feather name="check" size={14} color="#fff" />
            </View>
          )}
        </Pressable>
      );
    },
    [selectedStickers, handleToggle, theme],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            backgroundColor: theme.colors.background.default,
            paddingTop: Platform.OS === "ios" ? 0 : insets.top,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text size="lg" weight="bold">
              Stickers
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons
              name="close"
              size={28}
              color={theme.colors.text.default}
            />
          </Pressable>
          <Pressable onPress={handleDone} style={styles.doneButton}>
            <Text
              size="lg"
              weight="bold"
              style={{ color: theme.colors.brand[500] }}
            >
              Done{selectedStickers.length > 0 ? ` (${selectedStickers.length})` : ""}
            </Text>
          </Pressable>
        </View>
        <FlatList
          data={MEME_STICKERS}
          renderItem={renderItem}
          keyExtractor={(item) => item}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: insets.bottom + 20 },
          ]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    height: 52,
    position: "relative",
  },
  headerTitleContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  doneButton: {
    marginLeft: "auto",
    paddingHorizontal: theme.spacing.sm,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  grid: {
    padding: SPACING,
  },
  row: {
    gap: SPACING,
    marginBottom: SPACING,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    position: "relative",
  },
  stickerImage: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
}));
