import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/src/components/ui/primitives";
import { CURATOR_INVITE_STATUS, type TeamInvitation } from "@/src/domain/communities";
import { styles } from "./community-teams-styles";

const STATUS_LABEL: Record<number, string> = { 0: "Pending", 1: "Accepted", 2: "Revoked", 3: "Declined" };

export function CommunityTeamInvitations({ items, canRevoke, pending, loading, error, onRetry, onRevoke }: {
  items: TeamInvitation[]; canRevoke: boolean; pending: boolean; loading: boolean; error: boolean;
  onRetry: () => void; onRevoke: (target: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const outstanding = items.filter(item => item.status === CURATOR_INVITE_STATUS.PENDING);
  const shown = showHistory ? items : outstanding;
  return (
    <View style={styles.section}>
      <Text size="md" weight="semibold">Pending invitations{loading || error ? "" : ` (${outstanding.length})`}</Text>
      {loading ? <Text size="sm" mode="subtle">Loading invitations...</Text> : error ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Retry invitations" onPress={onRetry} style={{ minHeight: 44, justifyContent: "center" }}><Text size="sm">Invitations unavailable. Retry</Text></Pressable>
      ) : <>
        {shown.map(item => (
          <View key={`${item.invitee}:${item.created_height}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text size="sm" numberOfLines={1}>{item.username || item.invitee}</Text>
              <Text size="xs" mode="subtle">{STATUS_LABEL[item.status] ?? "Unknown"}</Text>
            </View>
            {canRevoke && item.status === CURATOR_INVITE_STATUS.PENDING ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Revoke invitation for ${item.username || item.invitee}`} accessibilityState={{ disabled: pending }}
                disabled={pending} onPress={() => onRevoke(item.invitee)} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: "center", opacity: pending ? 0.5 : 1 }}>
                <Text size="sm" weight="semibold">Revoke</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {!shown.length ? <Text size="sm" mode="subtle">No pending invitations</Text> : null}
        {items.length > outstanding.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel={showHistory ? "Hide invitation history" : "Show invitation history"} onPress={() => setShowHistory(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text size="sm" weight="semibold">{showHistory ? "Hide history" : "Invitation history"}</Text>
          </Pressable>
        ) : null}
      </>}
    </View>
  );
}
