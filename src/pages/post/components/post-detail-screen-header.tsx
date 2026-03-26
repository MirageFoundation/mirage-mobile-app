import { AntDesign } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type PostDetailScreenHeaderProps = {
  topInset: number;
  gradientColors: [string, string, ...string[]];
  onBack: () => void;
};

export function PostDetailScreenHeader({
  topInset,
  gradientColors,
  onBack,
}: PostDetailScreenHeaderProps) {
  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: topInset }]}
    >
      <Pressable onPress={onBack} style={styles.headerButton}>
        <AntDesign name="close" size={22} color="#FFFFFF" />
      </Pressable>

      <View style={styles.headerSpacer} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    flex: 1,
  },
}));
