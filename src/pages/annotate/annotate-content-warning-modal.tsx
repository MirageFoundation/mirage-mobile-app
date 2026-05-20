import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

const CONTENT_WARNING_OPTIONS: { value: string; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "adult", label: "Adult" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

type AnnotateContentWarningModalProps = {
  selectedTag: string;
  visible: boolean;
  onClear: () => void;
  onClose: () => void;
  onSelect: (tag: string) => void;
};

export function AnnotateContentWarningModal({
  selectedTag,
  visible,
  onClear,
  onClose,
  onSelect,
}: AnnotateContentWarningModalProps) {
  const { theme } = useUnistyles();

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
          style={[
            styles.tagModalContent,
            { backgroundColor: theme.colors.background.base },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.tagModalHeader}>
            <Text size="lg" weight="bold">
              Add content warning
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={theme.colors.text.subtle} />
            </Pressable>
          </View>
          <View style={styles.tagOptions}>
            {CONTENT_WARNING_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={styles.tagOption}
              >
                <Text size="md" style={{ color: theme.colors.text.default }}>
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.tagRadio,
                    {
                      borderColor:
                        selectedTag === option.value
                          ? theme.colors.brand[500]
                          : theme.colors.border.default,
                      backgroundColor:
                        selectedTag === option.value
                          ? theme.colors.brand[500]
                          : "transparent",
                    },
                  ]}
                >
                  {selectedTag === option.value && (
                    <Feather name="check" size={12} color="#fff" />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
          {selectedTag ? (
            <Pressable onPress={onClear} style={styles.clearTagButton}>
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
