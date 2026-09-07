import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import type { CurationTeamMember } from "@/src/domain/communities";
import { styles } from "./community-teams-styles";

export function CommunityTeamMembers({ owner, members, canManage, pending, onInvite, onRemove }: {
  owner: string; members: CurationTeamMember[]; canManage: boolean; pending: boolean;
  onInvite: () => void; onRemove: (address: string) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.section}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text size="md" weight="semibold">Members ({members.length})</Text>
        {canManage ? <Pressable accessibilityRole="button" accessibilityLabel="Invite curator" accessibilityState={{ disabled: pending }}
          disabled={pending} onPress={onInvite} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 8, opacity: pending ? 0.5 : 1 }}>
          <Ionicons name="person-add-outline" size={18} color={theme.colors.primary[500]} />
          <Text size="sm" weight="semibold" style={{ color: theme.colors.primary[500] }}>Invite</Text>
        </Pressable> : null}
      </View>
      {members.map(member => {
        const isOwner = member.address.toLowerCase() === owner.toLowerCase();
        return (
          <View key={member.address} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.background.subtle, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={isOwner ? "shield-checkmark-outline" : "person-outline"} size={18} color={theme.colors.text.subtle} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text size="md" weight="medium" numberOfLines={1}>{member.username || `${member.address.slice(0, 12)}...${member.address.slice(-6)}`}</Text>
              <Text size="xs" mode="subtle" selectable>{member.address}</Text>
            </View>
            <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: theme.colors.background.subtle }}>
              <Text size="xs" weight="semibold">{isOwner ? "Owner" : "Curator"}</Text>
            </View>
            {canManage && !isOwner ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.username || member.address}`} accessibilityState={{ disabled: pending }}
              disabled={pending} onPress={() => onRemove(member.address)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: pending ? 0.5 : 1 }}>
              <Ionicons name="person-remove-outline" size={19} color={theme.colors.text.subtle} />
            </Pressable> : null}
          </View>
        );
      })}
      {!members.length ? <Text size="sm" mode="subtle">No curators to show</Text> : null}
    </View>
  );
}
