import { Feather } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";

import { Text } from "@/src/components/ui/primitives";

export function AnnotateTagModal({
  borderColor,
  brandColor,
  onClose,
  onSelectTag,
  options,
  selectedTag,
  textColor,
}: {
  borderColor: string;
  brandColor: string;
  onClose: () => void;
  onSelectTag: (tag: string) => void;
  options: { label: string; value: string }[];
  selectedTag: string;
  textColor: string;
}) {
  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.tagModalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.tagModalHeader}>
            <Text size="lg" weight="bold">
              Add content warning
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={textColor} />
            </Pressable>
          </View>
          <View style={styles.tagOptions}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onSelectTag(option.value)}
                style={styles.tagOption}
              >
                <Text size="md">{option.label}</Text>
                <View
                  style={[
                    styles.tagRadio,
                    {
                      borderColor:
                        selectedTag === option.value ? brandColor : borderColor,
                      backgroundColor:
                        selectedTag === option.value ? brandColor : "transparent",
                    },
                  ]}
                >
                  {selectedTag === option.value ? (
                    <Feather name="check" size={12} color="#fff" />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          {selectedTag ? (
            <Pressable onPress={() => onSelectTag("")} style={styles.clearTagButton}>
              <Text size="sm" style={{ color: "#EF4444" }}>
                Remove warning
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = {
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center" as const,
    padding: 24,
  },
  tagModalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
  },
  tagModalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 16,
  },
  tagOptions: {
    gap: 12,
  },
  tagOption: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  tagRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  clearTagButton: {
    marginTop: 16,
    alignSelf: "flex-start" as const,
  },
};
