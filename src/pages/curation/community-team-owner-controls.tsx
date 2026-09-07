import { View } from "react-native";
import { Text } from "@/src/components/ui/primitives";
import type { CurationTeamDetail } from "@/src/domain/communities";
import type { TeamDetailActions } from "./use-team-detail-actions";
import { TeamDetailRow } from "./team-detail-row";
import { styles } from "./community-teams-styles";

export function CommunityTeamOwnerControls({ detail, actions }: { detail: CurationTeamDetail; actions: TeamDetailActions }) {
  return (
    <View style={styles.section}>
      <Text size="sm" weight="semibold" mode="subtle">TEAM SETTINGS</Text>
      <TeamDetailRow title="Edit team" description="Name and description" icon="create-outline" disabled={actions.locked} onPress={() => actions.open("profile")} />
      <TeamDetailRow title="Posting audience" description={detail.subscriber_only ? "Subscriber posts only" : "Posts from everyone"} icon="people-outline" disabled={actions.locked} onPress={() => actions.open("audience")} />
      <TeamDetailRow title="Content tag" description={detail.tag || "No team tag"} icon="pricetag-outline" disabled={actions.locked} onPress={() => actions.open("tag")} />
      <TeamDetailRow title="Advanced actions" description="Ownership and deletion" icon="options-outline" disabled={actions.locked} onPress={() => actions.open("advanced")} />
    </View>
  );
}
