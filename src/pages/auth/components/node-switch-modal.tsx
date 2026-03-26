import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ApiServer } from "@/src/stores";

type NodeSwitchModalProps = {
  visible: boolean;
  activeServer: ApiServer;
  servers: ApiServer[];
  switchingServer: ApiServer | null;
  onClose: () => void;
  onSelectServer: (server: ApiServer) => void | Promise<void>;
};

export function NodeSwitchModal({
  visible,
  activeServer,
  servers,
  switchingServer,
  onClose,
  onSelectServer,
}: NodeSwitchModalProps) {
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
          <Text
            size="lg"
            weight="bold"
            style={{ marginBottom: 16, textAlign: "center" }}
          >
            Switch Node
          </Text>
          {servers.map((server) => {
            const isActive = server === activeServer;
            const isSwitching = switchingServer === server;

            return (
              <Pressable
                key={server}
                disabled={!!switchingServer}
                onPress={() => {
                  void onSelectServer(server);
                }}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: isActive
                      ? `${theme.colors.primary[500]}10`
                      : "transparent",
                    opacity: switchingServer && !isSwitching ? 0.5 : 1,
                  },
                ]}
              >
                <View style={styles.optionContent}>
                  <Ionicons
                    name={isActive ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={
                      isActive
                        ? theme.colors.primary[500]
                        : theme.colors.text.subtle
                    }
                  />
                  <Text
                    size="md"
                    weight={isActive ? "semibold" : "regular"}
                    style={isActive ? { color: theme.colors.primary[500] } : undefined}
                  >
                    {server}
                  </Text>
                </View>
                {isSwitching ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary[500]}
                  />
                ) : null}
              </Pressable>
            );
          })}
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
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
}));
