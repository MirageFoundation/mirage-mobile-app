import { ContentWarningBadge, type ContentWarningType } from "@/src/components/atoms";
import { Text } from "@/src/components/ui/primitives";
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type PostCardContentProps = {
  title: string;
  bodyWithoutUrl?: string;
  extractedUrl: string | null;
  displayDomain: string | null;
  bodyVideoUrl: string | null;
  shouldBlurContent: boolean;
  contentWarnings?: ContentWarningType[];
  onRevealContent?: () => void;
  onPlayNowPress?: () => void;
};

export const PostCardContent = memo(function PostCardContent({
  title,
  bodyWithoutUrl,
  extractedUrl,
  displayDomain,
  bodyVideoUrl,
  shouldBlurContent,
  contentWarnings,
  onRevealContent,
  onPlayNowPress,
}: PostCardContentProps) {
  const { theme } = useUnistyles();
  const hasContentWarning = contentWarnings && contentWarnings.length > 0;

  return (
    <>
      {hasContentWarning && (
        <View style={styles.warningBadge}>
          <ContentWarningBadge
            types={contentWarnings}
            onPress={onRevealContent}
            compact
          />
        </View>
      )}

      <Text
        size="lg"
        weight="semibold"
        style={styles.title}
        numberOfLines={shouldBlurContent ? 1 : 3}
      >
        {title}
      </Text>

      {bodyWithoutUrl && !shouldBlurContent && (
        <Text size="sm" mode="default" style={styles.body} numberOfLines={4}>
          {bodyWithoutUrl}
        </Text>
      )}

      {extractedUrl && displayDomain && !shouldBlurContent && !bodyVideoUrl && (
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
          <Pressable onPress={onPlayNowPress} style={styles.playNowButton}>
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
  warningBadge: {
    marginTop: theme.spacing.sm,
  },
  title: {
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  body: {
    marginTop: theme.spacing.xs,
    lineHeight: 16,
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
