import { Modal, Pressable, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { StyleSheet } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ContentTag } from "@/src/api/write/endpoints/posts";

type ContentWarningOption = {
  value: ContentTag;
  label: string;
};

type CreateContentWarningModalProps = {
  visible: boolean;
  selectedContentWarning: ContentTag;
  options: ContentWarningOption[];
  backgroundColor: string;
  textColor: string;
  subtleTextColor: string;
  borderColor: string;
  brandColor: string;
  errorColor: string;
  onClose: () => void;
  onSelect: (warning: ContentTag) => void;
  onClear: () => void;
};

export function CreateContentWarningModal({
  visible,
  selectedContentWarning,
  options,
  backgroundColor,
  textColor,
  subtleTextColor,
  borderColor,
  brandColor,
  errorColor,
  onClose,
  onSelect,
  onClear,
}: CreateContentWarningModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              Add content warning
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={subtleTextColor} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={styles.option}
              >
                <Text size="md" style={{ color: textColor }}>
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor:
                        selectedContentWarning === option.value
                          ? brandColor
                          : borderColor,
                      backgroundColor:
                        selectedContentWarning === option.value
                          ? brandColor
                          : "transparent",
                    },
                  ]}
                >
                  {selectedContentWarning === option.value ? (
                    <View style={styles.checkboxDot} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>

          {selectedContentWarning ? (
            <Pressable onPress={onClear} style={styles.clearButton}>
              <Text size="sm" style={{ color: errorColor }}>
                Remove warning
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  options: {
    gap: theme.spacing.xs,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  clearButton: {
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
}));
