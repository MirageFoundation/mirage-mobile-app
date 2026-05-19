import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";

type CreateUploadWarningProps = {
  visible: boolean;
  kind: "image" | "video";
};

export function CreateUploadWarning({ visible, kind }: CreateUploadWarningProps) {
  const { theme } = useUnistyles();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 8,
        marginHorizontal: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: theme.colors.warning[500] + "15",
        gap: 8,
      }}
    >
      <Feather name="alert-triangle" size={14} color={theme.colors.warning[500]} />
      <Text size="xs" style={{ color: theme.colors.warning[500], flex: 1 }}>
        Please do not leave the app while {kind === "image" ? "images are" : "the video is"} uploading
      </Text>
    </Animated.View>
  );
}
