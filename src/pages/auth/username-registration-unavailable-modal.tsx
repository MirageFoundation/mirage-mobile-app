import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ApiServer } from "@/src/stores";
import { styles } from "./username-styles";

type UsernameRegistrationUnavailableModalProps = {
  activeServer: ApiServer;
  isSwitchingNode: boolean;
  otherServer: ApiServer;
  visible: boolean;
  onCancel: () => void;
  onSwitchNode: () => void;
};

export function UsernameRegistrationUnavailableModal({
  activeServer,
  isSwitchingNode,
  otherServer,
  visible,
  onCancel,
  onSwitchNode,
}: UsernameRegistrationUnavailableModalProps) {
  const { theme } = useUnistyles();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.colors.background.default },
          ]}
        >
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={theme.colors.warning[500]}
            />
          </View>
          <Text
            size="lg"
            weight="bold"
            style={{ textAlign: "center", marginBottom: 10 }}
          >
            Registration Unavailable
          </Text>
          <Text
            size="md"
            style={{
              textAlign: "center",
              color: theme.colors.text.subtle,
              marginBottom: 20,
            }}
          >
            Account creation is not available on{" "}
            <Text size="md" weight="semibold">
              {activeServer}
            </Text>
            . Switch to{" "}
            <Text size="md" weight="semibold">
              {otherServer}
            </Text>{" "}
            to create an account.
          </Text>
          <Pressable
            onPress={onSwitchNode}
            disabled={isSwitchingNode}
            style={{
              borderRadius: 12,
              overflow: "hidden",
              opacity: isSwitchingNode ? 0.7 : 1,
            }}
          >
            <LinearGradient
              colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              {isSwitchingNode ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}
                >
                  Switch to {otherServer}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={onCancel}
            disabled={isSwitchingNode}
            style={{
              paddingTop: 12,
              alignItems: "center",
              opacity: isSwitchingNode ? 0.3 : 1,
            }}
          >
            <Text size="md" style={{ color: theme.colors.text.subtle }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
