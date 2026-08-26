import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";

import { useCreateComposeState } from "./create-compose-state";
import { styles } from "./create-screen-styles";

export function CreateContentWarningButton() {
  const { theme } = useUnistyles();
  const selectedContentWarning = useCreateComposeState(
    (state) => state.selectedContentWarning,
  );
  const openContentWarningModal = useCreateComposeState(
    (state) => state.openContentWarningModal,
  );
  const clearContentWarning = useCreateComposeState(
    (state) => state.clearContentWarning,
  );

  return (
    <Pressable
      onPress={() => {
        triggerHaptic("selection");
        openContentWarningModal();
      }}
      style={[
        styles.tagsButton,
        {
          backgroundColor: theme.colors.background.lighter,
        },
      ]}
    >
      {selectedContentWarning ? (
        <View style={styles.contentWarningSelected}>
          <Text
            size="md"
            weight="bold"
            style={{ color: theme.colors.warning[500] }}
          >
            ⚠️{" "}
            {selectedContentWarning.charAt(0).toUpperCase() +
              selectedContentWarning.slice(1)}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              triggerHaptic("selection");
              clearContentWarning();
            }}
            hitSlop={8}
          >
            <Feather
              name="x"
              size={14}
              color={theme.colors.text.subtle}
            />
          </Pressable>
        </View>
      ) : (
        <Text
          size="md"
          weight="semibold"
          style={{ color: theme.colors.text.default }}
        >
          Add content warning (optional)
        </Text>
      )}
    </Pressable>
  );
}
