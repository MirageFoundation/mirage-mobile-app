import { Pressable, View } from "react-native";

import { Divider, Text } from "@/src/components/ui/primitives";
import { styles } from "./username-styles";

type UsernameFooterProps = {
  bottomInset: number;
  onLogin: () => void;
};

export function UsernameFooter({ bottomInset, onLogin }: UsernameFooterProps) {
  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + 16 }]}> 
      <Divider size="extraThin" />
      <Pressable onPress={onLogin} style={styles.loginLink}>
        <Text style={styles.loginText}>Log into existing account</Text>
      </Pressable>
    </View>
  );
}
