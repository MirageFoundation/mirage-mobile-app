import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";

import { styles } from "./post-detail-styles";

type PostDetailHeaderProps = {
  gradientColors: readonly string[];
  insetsTop: number;
  onBack: () => void;
};

export function PostDetailHeader({ gradientColors, insetsTop, onBack }: PostDetailHeaderProps) {
  return (
    <LinearGradient
      colors={[...gradientColors] as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insetsTop }]}
    >
      <Pressable onPress={onBack} style={styles.headerButton}>
        <AntDesign name="close" size={22} color="#FFFFFF" />
      </Pressable>

      <View style={styles.headerSpacer} />
    </LinearGradient>
  );
}
