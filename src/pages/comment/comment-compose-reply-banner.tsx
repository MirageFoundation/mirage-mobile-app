import { View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Text } from "@/src/components/ui/primitives";
import { styles } from "./comment-compose-styles";

type CommentComposeReplyBannerProps = {
  username?: string;
};

export function CommentComposeReplyBanner({ username }: CommentComposeReplyBannerProps) {
  const { theme } = useUnistyles();
  if (!username) return null;

  return (
    <View style={styles.replyBanner}>
      <Text size="xs" mode="subtle">
        Replying to{" "}
        <Text
          size="xs"
          weight="semibold"
          style={{ color: theme.colors.brand[500] }}
        >
          @{username}
        </Text>
      </Text>
    </View>
  );
}
