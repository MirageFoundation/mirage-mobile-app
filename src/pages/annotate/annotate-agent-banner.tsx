import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./annotate-styles";

export function AnnotateAgentBanner() {
  return (
    <View style={[styles.agentBanner, { borderColor: "#EF4444" + "30" }]}> 
      <View
        style={[
          styles.agentBannerIcon,
          { backgroundColor: "#EF4444" + "15" },
        ]}
      >
        <Ionicons name="shield-checkmark" size={18} color="#EF4444" />
      </View>
      <View style={styles.agentBannerText}>
        <Text size="sm" weight="semibold">
          Agent Annotation
        </Text>
        <Text size="xs" mode="subtle">
          Your changes overlay this post for users who enabled you.
        </Text>
      </View>
    </View>
  );
}
