import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ApiServer } from "@/src/stores";

type RegistrationUnavailableModalProps = {
  visible: boolean;
  activeServer: ApiServer;
  targetServer: ApiServer;
  isSwitching: boolean;
  onClose: () => void;
  onSwitch: () => void | Promise<void>;
};

export function RegistrationUnavailableModal({
  visible,
  activeServer,
  targetServer,
  isSwitching,
  onClose,
  onSwitch,
}: RegistrationUnavailableModalProps) {
  const { theme } = useUnistyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.colors.background.default },
          ]}
        >
          <View style={styles.iconWrapper}>
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
            Account creation is not available on <Text size="md" weight="semibold">{activeServer}</Text>. Switch to <Text size="md" weight="semibold">{targetServer}</Text> to create an account.
          </Text>
          <Pressable
            onPress={() => {
              void onSwitch();
            }}
            disabled={isSwitching}
            style={{ width: "100%", opacity: isSwitching ? 0.7 : 1 }}
          >
            <LinearGradient
              colors={["rgb(102, 126, 234)", "rgb(118, 75, 162)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButton}
            >
              {isSwitching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>Switch to {targetServer}</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={onClose}
            disabled={isSwitching}
            style={{ alignItems: "center", paddingTop: 12, opacity: isSwitching ? 0.3 : 1 }}
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

const styles = StyleSheet.create(() => ({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "75%",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  iconWrapper: {
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
}));
