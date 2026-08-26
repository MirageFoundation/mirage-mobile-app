import { Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { hasSpoilers, parseSpoilers } from "@/src/utils/spoiler-parser";
import { hasHashtags, parseHashtags } from "@/src/utils/hashtag-parser";

type PostCardContentProps = {
  title: string;
  extractedUrl: string | null;
  displayDomain: string | null;
  bodyVideoUrl: string | null;
  shouldBlurContent: boolean;
  /** Whether to show the URL card/Play Now row (default: true) */
  showUrlCard?: boolean;
  disabled?: boolean;
  onRevealContent?: () => void;
  onPlayNowPress?: () => void;
};

export const PostCardContent = memo(function PostCardContent({
  title,
  extractedUrl,
  displayDomain,
  bodyVideoUrl,
  shouldBlurContent,
  showUrlCard = true,
  disabled = false,
  onRevealContent,
  onPlayNowPress,
}: PostCardContentProps) {
  const { theme } = useUnistyles();

  return (
    <>
      <Text
        size="lg"
        weight="bold"
        style={styles.title}
      >
        {hasSpoilers(title)
          ? parseSpoilers(title)
          : hasHashtags(title)
          ? parseHashtags(title)
          : title}
      </Text>

      {showUrlCard && extractedUrl && displayDomain && !shouldBlurContent && !bodyVideoUrl && (
        <View style={styles.urlCard}>
          <View style={styles.urlInfo}>
            <Ionicons
              name="globe-outline"
              size={16}
              color={theme.colors.text.subtle}
            />
            <Text
              size="sm"
              mode="subtle"
              numberOfLines={1}
              style={styles.domainText}
            >
              {displayDomain}
            </Text>
          </View>
          <Pressable onPress={disabled ? undefined : onPlayNowPress} disabled={disabled} style={styles.playNowButton}>
            <Text size="sm" weight="semibold" style={styles.playNowText}>
              Play Now
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  title: {
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  urlCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: theme.spacing.sm,
  },
  urlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    flex: 1,
  },
  domainText: {
    flex: 1,
  },
  playNowButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border.subtle,
  },
  playNowText: {
    color: theme.colors.text.default,
  },
}));
