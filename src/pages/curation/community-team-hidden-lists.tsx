import { Pressable, View } from "react-native";
import { Text } from "@/src/components/ui/primitives";
import type { TeamDetailController } from "./use-community-team-detail-controller";
import { styles } from "./community-teams-styles";

export function CommunityTeamHiddenLists({ controller, kind }: { controller: TeamDetailController; kind: "users" | "posts" }) {
  const users = kind === "users";
  const loading = users ? controller.usersLoading : controller.postsLoading;
  const error = users ? controller.usersError : controller.postsError;
  const items = users
    ? controller.hiddenUsers.map(item => ({ id: item.address, label: item.username || item.address }))
    : controller.hiddenPosts.map(item => ({ id: item.post_id, label: item.title || item.post_id }));
  const hasMore = users ? controller.usersHasMore : controller.postsHasMore;
  const retry = users ? controller.retryUsers : controller.retryPosts;
  const loadMore = users ? controller.loadMoreUsers : controller.loadMorePosts;
  return (
    <View style={styles.section}>
      <Text size="md" weight="semibold">Hidden {kind}</Text>
      <Text size="sm" mode="subtle">Hidden from this team's lens, not the entire community.</Text>
      {error ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry hidden ${kind}`} onPress={() => void retry()} style={{ minHeight: 44, justifyContent: "center" }}><Text size="sm">Could not load {kind}. Retry</Text></Pressable> : null}
      {loading && !items.length ? <Text size="sm" mode="subtle">Loading...</Text> : null}
      {!loading && !error && !items.length ? <Text size="sm" mode="subtle">No hidden {kind}</Text> : null}
      {items.map(item => <Text key={item.id} size="sm" selectable style={{ paddingVertical: 12 }}>{item.label}</Text>)}
      {hasMore ? <Pressable accessibilityRole="button" accessibilityLabel={`Load more hidden ${kind}`} accessibilityState={{ disabled: loading }} disabled={loading} onPress={loadMore} style={{ minHeight: 44, justifyContent: "center" }}><Text size="sm" weight="semibold">{loading ? "Loading..." : "Load more"}</Text></Pressable> : null}
    </View>
  );
}
