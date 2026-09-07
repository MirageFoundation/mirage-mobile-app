import { Pressable, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useUnistyles } from "react-native-unistyles";
import { Text } from "@/src/components/ui/primitives";
import { ALLOWED_CURATION_TAGS, MAX_CURATION_TEAM_DESCRIPTION_LENGTH, MAX_CURATION_TEAM_NAME_LENGTH, normalizeAddress, type CurationTeamDetail } from "@/src/domain/communities";
import { TeamDetailRow } from "./team-detail-row";
import type { TeamDetailActions } from "./use-team-detail-actions";
import { styles } from "./community-teams-styles";

export function TeamDetailActionFields({ detail, actions }: { detail: CurationTeamDetail; actions: TeamDetailActions }) {
  const { theme } = useUnistyles();
  const { action, draft, locked, updateDraft } = actions;
  const fieldStyle = [styles.input, { color: theme.colors.text.default, borderColor: theme.colors.border.default }];
  const input = (label: string, field: "name" | "description" | "target" | "confirmation", multiline = false) => (
    <View style={{ gap: 4 }}>
      <Text size="sm" weight="semibold">{label}</Text>
      <BottomSheetTextInput
        accessibilityLabel={label} value={draft[field]} onChangeText={value => updateDraft({ [field]: value })}
        editable={!locked} multiline={multiline} autoCapitalize={field === "target" ? "none" : "sentences"}
        autoCorrect={field !== "target" && field !== "confirmation"}
        maxLength={field === "name" ? MAX_CURATION_TEAM_NAME_LENGTH : field === "description" ? MAX_CURATION_TEAM_DESCRIPTION_LENGTH : undefined}
        placeholderTextColor={theme.colors.text.subtle} placeholder={field === "target" ? "@alice, alice, or mirage1..." : undefined}
        autoComplete={field === "target" ? "off" : undefined}
        style={[fieldStyle, multiline ? { minHeight: 112, textAlignVertical: "top" } : null]}
      />
    </View>
  );
  const choice = (label: string, selected: boolean, onPress: () => void, description?: string) => (
    <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected, disabled: locked }}
      disabled={locked} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingVertical: 10 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: selected ? 6 : 1, borderColor: selected ? theme.colors.primary[500] : theme.colors.border.default }} />
      <View style={{ flex: 1, gap: 3 }}><Text size="md">{label}</Text>{description ? <Text size="sm" mode="subtle">{description}</Text> : null}</View>
    </Pressable>
  );

  switch (action) {
    case "profile": return <>{input("Team name", "name")}{input("Description", "description", true)}</>;
    case "invite": return <><Text size="sm" mode="subtle">Invite someone to curate this community with your team. They must accept before joining.</Text>{input("Username or wallet address", "target")}</>;
    case "audience": return <>
      <Text size="sm" mode="subtle">Choose which posts appear through this team's lens. Subscriber-only posting checks the author's subscription when the post was created; it does not restrict who can read.</Text>
      {choice("Everyone", !draft.enabled, () => updateDraft({ enabled: false }), "Include posts from all authors")}
      {choice("Subscribers", draft.enabled, () => updateDraft({ enabled: true }), "Include posts created by active subscribers")}
    </>;
    case "tag": return <>
      <Text size="sm" mode="subtle">Apply a content tag across this team's community lens, overriding author tags. Curators can override individual posts.</Text>
      {ALLOWED_CURATION_TAGS.map(tag => choice(tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : "No team tag", draft.tag === tag, () => updateDraft({ tag })))}
    </>;
    case "advanced": return <>
      <Text size="sm" mode="subtle">These actions change who controls the team or permanently delete it.</Text>
      <TeamDetailRow title="Transfer ownership" description="Choose an existing curator" icon="swap-horizontal-outline" onPress={() => actions.open("transfer")} />
      <TeamDetailRow title="Delete team" description="Permanently remove this team" icon="trash-outline" danger onPress={() => actions.open("delete")} />
    </>;
    case "transfer": {
      const candidates = detail.members.filter(member => normalizeAddress(member.address) !== normalizeAddress(detail.owner));
      return <>
        <Text size="sm" mode="subtle">The selected curator will become the owner. You will lose owner controls.</Text>
        {candidates.map(member => choice(member.username || member.address, normalizeAddress(draft.target) === normalizeAddress(member.address), () => updateDraft({ target: member.address })))}
        {!candidates.length ? <Text size="sm" mode="subtle">Invite a curator and wait for them to join before transferring ownership.</Text> : null}
        <Text size="sm">Type {detail.name} to confirm this transfer.</Text>
        {input("Confirm team name", "confirmation")}
      </>;
    }
    case "delete": return <>
      <Text size="sm" mode="subtle">This permanently deletes the curator team. This action cannot be undone.</Text>
      <Text size="sm">Type {detail.name} to confirm deletion.</Text>
      {input("Confirm team name", "confirmation")}
    </>;
    case "leave": return <Text size="md">Leave {detail.name}? You will lose access to its curator tools and need a new invitation to rejoin.</Text>;
    case "remove": return <><Text size="md">Remove this curator from {detail.name}? They will lose access to the team's curator tools.</Text><Text size="sm" selectable>{draft.target}</Text></>;
    case "revoke": return <><Text size="md">Revoke this pending invitation? The recipient will no longer be able to accept it.</Text><Text size="sm" selectable>{draft.target}</Text></>;
    default: return null;
  }
}
