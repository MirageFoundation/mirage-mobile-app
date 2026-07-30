import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import {
  CONTENT_WARNING_OPTIONS,
  type ContentWarningId,
} from "@/src/domain/content";

type ContentWarningSelectionModalProps = {
  visible: boolean;
  selectedIds: readonly ContentWarningId[];
  onToggle: (id: ContentWarningId) => void;
  onClear: () => void;
  onClose: () => void;
  selectionIndicator?: "check" | "dot";
};

export function ContentWarningSelectionModal({
  visible,
  selectedIds,
  onToggle,
  onClear,
  onClose,
  selectionIndicator = "dot",
}: ContentWarningSelectionModalProps) {
  const { theme } = useUnistyles();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          accessibilityViewIsModal
          style={[
            styles.content,
            { backgroundColor: theme.colors.background.base },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text size="lg" weight="bold">
              Add content warning
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close content warning options"
              onPress={onClose}
              hitSlop={12}
            >
              <Feather name="x" size={20} color={theme.colors.text.subtle} />
            </Pressable>
          </View>

          <View accessibilityRole="radiogroup" style={styles.options}>
            {CONTENT_WARNING_OPTIONS.map((option) => {
              const selected = selectedIds.includes(option.id);

              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onToggle(option.id)}
                  style={styles.option}
                >
                  <Text size="md" style={{ color: theme.colors.text.default }}>
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: selected
                          ? theme.colors.brand[500]
                          : theme.colors.border.default,
                        backgroundColor: selected
                          ? theme.colors.brand[500]
                          : "transparent",
                      },
                    ]}
                  >
                    {selected && selectionIndicator === "check" ? (
                      <Feather name="check" size={12} color="#fff" />
                    ) : null}
                    {selected && selectionIndicator === "dot" ? (
                      <View style={styles.dot} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {selectedIds.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove content warning"
              onPress={onClear}
              style={styles.clearButton}
            >
              <Text size="sm" style={{ color: theme.colors.error[500] }}>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  content: {
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
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
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
