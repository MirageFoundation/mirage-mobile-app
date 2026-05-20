import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { calculateDisplayPoints } from "@/src/api/read";
import type { Post } from "@/src/api/types";
import { TimeAgo } from "@/src/components/atoms/time-ago";
import { MarkdownContent } from "@/src/components/ui/markdown-content";
import { Text } from "@/src/components/ui/primitives";
import {
  useCommentCountOverride,
  useVoteOverride,
} from "@/src/stores/home-post-card-store";
import { getUsernameColor } from "@/src/utils/tiers";
import { styles } from "./search-styles";
import { formatCount } from "./search-utils";

type SearchPostResultProps = {
  item: Post;
  index: number;
  totalPosts: number;
  dividerColor: string;
  textSubtleColor: string;
  onPress: (post: Post) => void;
};

export function SearchPostResult({
  item,
  index,
  totalPosts,
  dividerColor,
  textSubtleColor,
  onPress,
}: SearchPostResultProps) {
  const voteOverride = useVoteOverride(item.post_id);
  const commentCountOverride = useCommentCountOverride(item.post_id);
  const isLast = index === totalPosts - 1;
  const hasThumbnail = item.thumbnail && item.thumbnail.length > 0;
  const timestampMs = item.timestamp * 1000;

  const displayPoints = voteOverride?.likes ?? calculateDisplayPoints(item);
  const displayComments =
    commentCountOverride && item.comments === commentCountOverride.baseComments
      ? commentCountOverride.baseComments +
        (commentCountOverride.commentDelta ?? 0)
      : item.comments;

  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(150)}>
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.postResultItem,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={styles.postResultContent}>
          <View style={styles.postResultHeader}>
            <Text
              size="sm"
              weight="medium"
              numberOfLines={1}
              style={(item.new_user ?? item.author_is_new)
                ? { color: "rgb(94,194,106)" }
                : (item.level ?? item.author_level ?? item.user_level)
                  ? {
                      color: getUsernameColor(
                        item.level ?? item.author_level ?? item.user_level ?? 0,
                      ),
                    }
                  : { color: textSubtleColor }}
            >
              @{item.username || "anonymous"}
            </Text>
            <Text size="sm" mode="subtle">
              •
            </Text>
            <TimeAgo
              timestamp={timestampMs}
              size="sm"
              mode="subtle"
              weight="regular"
              showSuffix={false}
            />
          </View>

          {item.title ? (
            <Text
              size="md"
              weight="regular"
              numberOfLines={2}
              style={styles.postTitle}
            >
              {item.title}
            </Text>
          ) : item.content ? (
            <View>
              <MarkdownContent content={item.content} />
            </View>
          ) : null}

          <View style={styles.postResultMeta}>
            <Text size="sm" mode="subtle">
              {formatCount(Math.round(displayPoints), "point", "points")}
            </Text>
            <Text size="sm" mode="subtle">
              •
            </Text>
            <Text size="sm" mode="subtle">
              {formatCount(displayComments, "comment", "comments")}
            </Text>
          </View>
        </View>

        {hasThumbnail && (
          <Image
            source={{ uri: item.thumbnail }}
            style={styles.postThumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        )}
      </Pressable>
      {!isLast && (
        <View
          style={[
            styles.divider,
            { backgroundColor: dividerColor },
          ]}
        />
      )}
    </Animated.View>
  );
}
