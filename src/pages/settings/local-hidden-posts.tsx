import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { useAuthStore, useContentModerationStore, useSavedPostsStore } from "@/src/stores";
import { useHistoryStore } from "@/src/stores/history-store";
import { useToast } from "@/src/providers/toast-provider";

export function LocalHiddenPosts() {
  const [visible, setVisible] = useState(false);
  const hidden = useContentModerationStore((s) => s.hiddenPostIds);
  const saved = useSavedPostsStore((s) => s.savedPosts);
  const history = useHistoryStore((s) => s.entries);
  const viewer = useAuthStore((s) => s.walletAddress);
  const titles = useMemo(() => new Map([...history, ...saved].map((post) => [post.id, post.title])), [history, saved]);
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  return <>
    <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={{ padding: 16 }}>
      <Text size="sm" weight="semibold">Hidden for me ({hidden.size})</Text>
      <Text size="xs" mode="subtle">Recover posts hidden locally, separate from on-chain blocks.</Text>
    </Pressable>
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background.default, paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ padding: 16, gap: 8 }}>
          <Text size="lg" weight="semibold">Hidden for me</Text>
          <Text size="sm" mode="subtle">Only on this device for this wallet. Unhiding does not change personal on-chain blocks or team moderation.</Text>
          <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={{ paddingVertical: 12 }}><Text size="sm">Close</Text></Pressable>
        </View>
        <FlatList data={[...hidden]} keyExtractor={(id) => id}
          ListEmptyComponent={<Text size="sm" style={{ padding: 16 }}>No locally hidden posts.</Text>}
          renderItem={({ item: id }) => <View style={{ padding: 16, gap: 8, borderBottomWidth: 0.5, borderColor: theme.colors.border.subtle }}>
            <Text size="sm" numberOfLines={2}>{titles.get(id) || "Post details unavailable"}</Text>
            <Text size="xs" mode="subtle" selectable>{id}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Unhide for me: ${titles.get(id) || id}`} style={{ minHeight: 44, justifyContent: "center" }} onPress={() => {
              if (useAuthStore.getState().walletAddress !== viewer) return;
              useContentModerationStore.getState().unhidePost(id);
              toast.success("Unhidden for me");
            }}><Text size="sm" weight="semibold">Unhide for me</Text></Pressable>
          </View>} />
      </View>
    </Modal>
  </>;
}
