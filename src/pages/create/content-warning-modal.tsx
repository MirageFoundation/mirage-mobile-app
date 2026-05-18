import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import type { ContentTag } from "@/src/api/write/endpoints/posts";
import { Text } from "@/src/components/ui/primitives";
import { CONTENT_WARNING_OPTIONS } from "./create-screen-utils";
import { styles } from "./create-screen-styles";

type ContentWarningModalProps = {
  visible: boolean;
  selectedContentWarning: ContentTag | "";
  onClose: () => void;
  onSelect: (warning: ContentTag) => void;
  onClear: () => void;
};

export function ContentWarningModal({
  visible,
  selectedContentWarning,
  onClose,
  onSelect,
  onClear,
}: ContentWarningModalProps) {
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
            styles.contentWarningModalContent,
            { backgroundColor: theme.colors.background.base },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.contentWarningHeader}>
            <Text size="lg" weight="bold">
              Add content warning
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={theme.colors.text.subtle} />
            </Pressable>
          </View>

          <View style={styles.contentWarningOptions}>
            {CONTENT_WARNING_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={styles.contentWarningOption}
              >
                <Text size="md" style={{ color: theme.colors.text.default }}>
                  {option.label}
                </Text>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor:
                        selectedContentWarning === option.value
                          ? theme.colors.brand[500]
                          : theme.colors.border.default,
                      backgroundColor:
                        selectedContentWarning === option.value
                          ? theme.colors.brand[500]
                          : "transparent",
                    },
                  ]}
                >
                  {selectedContentWarning === option.value && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: "#fff",
                      }}
                    />
                  )}
                </View>
              </Pressable>
            ))}
          </View>

          {selectedContentWarning && (
            <Pressable onPress={onClear} style={styles.clearWarningButton}>
              <Text size="sm" style={{ color: theme.colors.error[500] }}>
                Remove warning
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
