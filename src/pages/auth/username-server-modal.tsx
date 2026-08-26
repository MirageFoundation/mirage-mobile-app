import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import type { ApiServer } from "@/src/stores";
import { styles } from "./username-styles";

type UsernameServerModalProps = {
  activeServer: ApiServer;
  servers: ApiServer[];
  switchingServer: ApiServer | null;
  visible: boolean;
  onClose: () => void;
  onSelectServer: (server: ApiServer) => void;
};

export function UsernameServerModal({
  activeServer,
  servers,
  switchingServer,
  visible,
  onClose,
  onSelectServer,
}: UsernameServerModalProps) {
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
                  if (!isActive) {
                    onSelectServer(server);
                    return;
                  }
                  onClose();
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    flex: 1,
                  }}
                >
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
                    style={
                      isActive ? { color: theme.colors.primary[500] } : undefined
                    }
                  >
                    {server}
                  </Text>
                </View>
                {isSwitching && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primary[500]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}
