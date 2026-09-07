import { Pressable, View } from "react-native";

import { Box, Text } from "@/src/components/ui/primitives";
import { useCreatorEarningTargets } from "@/src/api/read/hooks/use-creator-earnings";
import {
  formatMirageAmount,
  type CreatorEarningItem,
  type CreatorEarningTarget,
} from "@/src/domain/creator-earnings";
import { styles } from "./creator-earnings-styles";

function TargetRow({ target }: { target: CreatorEarningTarget }) {
  const label = target.deleted
    ? "Deleted post"
    : target.title || target.excerpt || (target.is_comment ? "Comment" : "Post");
  return (
    <View style={styles.targetRow}>
      <Text size="sm" weight="semibold" numberOfLines={2}>
        {label}
      </Text>
      <Text size="xs" mode="subtle">
        {formatMirageAmount(target.amount)}
        {target.community ? ` · ${target.community}` : ""}
      </Text>
    </View>
  );
}

export function CreatorEarningsTargets({
  creator,
  item,
}: {
  creator: string;
  item: CreatorEarningItem;
}) {
  const extra = useCreatorEarningTargets(creator, item.epoch_id, {
    enabled: item.posts_has_more,
  });
  const extraItems = extra.data?.pages.flatMap((page) => page.items) ?? [];
  const shown = extra.isSuccess && extraItems.length > 0 ? extraItems : item.posts;

  return (
    <Box mt="sm">
      {shown.length === 0 ? (
        <Text size="sm" mode="subtle">No target breakdown</Text>
      ) : (
        shown.map((target) => <TargetRow key={target.txhash} target={target} />)
      )}
      {(item.posts_has_more || extra.hasNextPage) && (
        <Pressable
          onPress={() => void extra.fetchNextPage()}
          disabled={extra.isFetchingNextPage}
        >
          <Text size="sm" weight="semibold">
            {extra.isFetchingNextPage ? "Loading targets…" : "Load more targets"}
          </Text>
        </Pressable>
      )}
    </Box>
  );
}
