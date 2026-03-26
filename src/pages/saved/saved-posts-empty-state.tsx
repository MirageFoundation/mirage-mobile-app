import { View } from "react-native";
import { Image } from "expo-image";

import { Text } from "@/src/components/ui/primitives";

import { SAVED_POSTS_EMPTY_INFO_IMAGE } from "./saved-posts-utils";

export function SavedPostsEmptyState({
  type,
}: {
  type: "posts" | "comments";
}) {
  return (
    <View style={styles.emptyContainer}>
      <Image
        source={SAVED_POSTS_EMPTY_INFO_IMAGE}
        style={styles.emptyImage}
        contentFit="contain"
      />
      <Text size="lg" weight="bold" style={styles.emptyTitle}>
        {type === "posts" ? "No saved posts yet" : "No saved comments yet"}
      </Text>
      <Text size="md" mode="subtle" style={styles.emptySubtitle}>
        {type === "posts"
          ? "Posts you save will appear here"
          : "Comments you save will appear here"}
      </Text>
    </View>
  );
}

const styles = {
  emptyContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 24,
  },
  emptyImage: {
    width: 200,
    height: 200,
    marginBottom: 16,
  },
  emptyTitle: {
    textAlign: "center" as const,
    marginBottom: 4,
  },
  emptySubtitle: {
    textAlign: "center" as const,
  },
};
