import { Pressable, View } from "react-native";

import { Checkbox, Text } from "@/src/components/ui/primitives";
import {
  formatCreatorRewardTime,
  formatMirageAmount,
  isCreatorEarningClaimable,
  remainingAmount,
  type CreatorEarningItem,
} from "@/src/domain/creator-earnings";
import { CreatorEarningsTargets } from "./creator-earnings-targets";
import { styles } from "./creator-earnings-styles";

export function CreatorEarningsRow({
  item,
  creator,
  canSelect,
  selected,
  selectionAtCap,
  epochSeconds,
  expanded,
  onToggle,
  onToggleExpand,
}: {
  item: CreatorEarningItem;
  creator: string;
  canSelect: boolean;
  selected: boolean;
  selectionAtCap: boolean;
  epochSeconds: number | null;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  const claimable = isCreatorEarningClaimable(item);
  const remaining = remainingAmount(item);
  const claimed = item.claimed_height != null || remaining <= 0n;
  const nowSec = Math.floor(Date.now() / 1000);
  const expired =
    item.claim_deadline_unix != null && nowSec >= item.claim_deadline_unix;
  const deadline = formatCreatorRewardTime(item.claim_deadline_unix, epochSeconds);
  const start = formatCreatorRewardTime(item.epoch_start_unix, epochSeconds);
  const status = claimed
    ? item.claimed_height == null
      ? "Claimed"
      : `Claimed at height ${item.claimed_height}`
    : expired
      ? deadline
        ? `Expired ${deadline}`
        : "Expired"
      : deadline
        ? `Claim before ${deadline}`
        : "Claimable";

  return (
    <View style={styles.row}>
      {canSelect ? (
        <Checkbox
          checked={selected}
          mode={!claimable || (!selected && selectionAtCap) ? "disabled" : "primary"}
          onChange={() => {
            if (!claimable || (!selected && selectionAtCap)) return;
            onToggle();
          }}
        />
      ) : null}
      <Pressable style={styles.rowInfo} onPress={onToggleExpand}>
        <Text size="md" weight="semibold">
          {start || `Epoch ${item.epoch_id}`}
        </Text>
        <Text size="sm" mode="subtle">{status}</Text>
        {expanded ? <CreatorEarningsTargets creator={creator} item={item} /> : (
          <Text size="xs" mode="subtle">
            {item.posts_has_more ? "Show target details" : `${item.posts.length} target${item.posts.length === 1 ? "" : "s"}`}
          </Text>
        )}
      </Pressable>
      <Text size="sm" weight="bold" style={styles.amount}>
        {formatMirageAmount(remaining)}
      </Text>
    </View>
  );
}
