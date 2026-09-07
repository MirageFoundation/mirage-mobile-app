import { useState } from "react";
import { Pressable, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { CommunityTeamMembers } from "./community-team-members";
import { CommunityTeamInvitations } from "./community-team-invitations";
import { CommunityTeamOwnerControls } from "./community-team-owner-controls";
import { CommunityTeamHiddenLists } from "./community-team-hidden-lists";
import { TeamDetailRow } from "./team-detail-row";
import type { TeamDetailController } from "./use-community-team-detail-controller";
import { styles } from "./community-teams-styles";

export type TeamDetailSection = "members" | "invitations" | "moderation" | "settings";

export function TeamDetailOverview({ controller, section }: { controller: TeamDetailController; section: TeamDetailSection }) {
  const { detail, actions } = controller;
  const { theme } = useUnistyles();
  const [kind, setKind] = useState<"posts" | "users">("posts");
  if (!detail) return null;
  if (section === "settings" && controller.role !== "none") return <>
    {controller.isOwner ? <CommunityTeamOwnerControls detail={detail} actions={actions} /> : null}
    {controller.canLeave ? <View style={styles.section}><TeamDetailRow title="Leave team" description="Give up your curator access" icon="exit-outline" danger disabled={actions.locked} onPress={() => actions.open("leave")} /></View> : null}
  </>;
  if (section === "invitations" && controller.role !== "none") return <CommunityTeamInvitations
    items={controller.invitations} canRevoke={controller.isOwner} pending={actions.locked}
    loading={controller.invitationsLoading} error={controller.invitationsError} onRetry={() => void controller.retryInvitations()}
    onRevoke={target => actions.open("revoke", target)} />;
  if (section === "moderation" && controller.role !== "none") return <>
    <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
      {(["posts", "users"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={`Hidden ${value}`}
        accessibilityState={{ selected: kind === value }} onPress={() => setKind(value)}
        style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center", backgroundColor: kind === value ? theme.colors.background.subtle : "transparent" }}>
        <Text size="sm" weight={kind === value ? "semibold" : "regular"}>Hidden {value}</Text>
      </Pressable>)}
    </View>
    <CommunityTeamHiddenLists controller={controller} kind={kind} />
  </>;
  return <CommunityTeamMembers owner={detail.owner} members={detail.members} canManage={controller.isOwner} pending={actions.locked}
    onInvite={() => actions.open("invite")} onRemove={target => actions.open("remove", target)} />;
}
