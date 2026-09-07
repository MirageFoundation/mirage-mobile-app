import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";
import { Box, Text } from "@/src/components/ui/primitives";
import { TeamDetailOverview, type TeamDetailSection } from "./team-detail-overview";
import { TeamDetailActionSheet } from "./team-detail-action-sheet";
import { styles } from "./community-teams-styles";
import { useCommunityTeamDetailController } from "./use-community-team-detail-controller";

export function CommunityTeamDetailScreen() {
  const params = useLocalSearchParams<{ slug: string; teamId: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const teamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useUnistyles();
  const controller = useCommunityTeamDetailController(slug, teamId);
  const { detail, actions } = controller;
  const [section, setSection] = useState<TeamDetailSection>("members");
  const activeSection = controller.role === "none" ? "members" : section;
  const ready = controller.isValid && !controller.isLoading && !controller.isError && !!detail;
  const tabs = [{ id: "members", label: "Members" }, { id: "invitations", label: "Invitations" }, { id: "moderation", label: "Moderation" }] as const;

  return (
    <Box flex background="base">
      <View style={{ paddingTop: insets.top, backgroundColor: theme.colors.background.default, borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle }}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={router.back} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
          </Pressable>
          <Text size="lg" weight="semibold" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>{ready ? detail.name : "Team"}</Text>
          {ready && controller.role !== "none" ? <Pressable accessibilityRole="button" accessibilityLabel="Team options"
            accessibilityState={{ expanded: activeSection === "settings" }} onPress={() => setSection(activeSection === "settings" ? "members" : "settings")}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="ellipsis-vertical" size={22} color={theme.colors.text.default} />
          </Pressable> : null}
        </View>
      </View>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void controller.refetch()} tintColor={theme.colors.text.subtle} />}>
        {!controller.isValid ? <Box center p="lg"><Text>Team not found</Text></Box>
          : controller.isLoading ? <Box center p="lg"><ActivityIndicator color={theme.colors.text.subtle} accessibilityLabel="Loading team" /></Box>
            : controller.isError || !detail ? <Box center p="lg"><Text>Failed to load team</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry team" onPress={() => void controller.refetch()} style={{ minHeight: 44, justifyContent: "center" }}><Text weight="semibold">Retry</Text></Pressable>
            </Box> : <>
              <View style={styles.section}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Open community" onPress={controller.openCommunity} style={{ minHeight: 44, justifyContent: "center" }}>
                    <Text size="sm" mode="subtle">[{controller.slug}]</Text>
                  </Pressable>
                  <Text size="sm" mode="subtle">{detail.members.length} {detail.members.length === 1 ? "member" : "members"} · {detail.subscriber_count} {detail.subscriber_count === "1" ? "subscriber" : "subscribers"}{controller.role !== "none" ? ` · ${controller.role === "owner" ? "Owner" : "Curator"}` : ""}</Text>
                </View>
                {detail.description?.trim() ? <Text size="sm">{detail.description}</Text> : null}
                {detail.deleted ? <Text size="sm" style={{ color: theme.colors.error[500] }} accessibilityRole="alert">This team has been deleted. Its curator tools are no longer available.</Text> : null}
              </View>
              {controller.role !== "none" ? <View accessibilityRole="tablist" style={{ flexDirection: "row", marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border.subtle }}>
                {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: activeSection === tab.id }} onPress={() => setSection(tab.id)}
                  style={{ flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center", borderBottomWidth: 2, borderBottomColor: activeSection === tab.id ? theme.colors.primary[500] : "transparent" }}>
                  <Text size="sm" weight={activeSection === tab.id ? "semibold" : "regular"} style={{ color: activeSection === tab.id ? theme.colors.text.default : theme.colors.text.subtle }}>{tab.label}</Text>
                </Pressable>)}
              </View> : null}
              {actions.syncing ? <Pressable accessibilityRole="button" accessibilityLabel="Review pending team change" onPress={actions.resume} style={[styles.section, { backgroundColor: theme.colors.background.subtle, minHeight: 48 }]}>
                <Text size="sm" weight="semibold">Changes still syncing · Check status</Text>
              </Pressable> : null}
              <TeamDetailOverview controller={controller} section={activeSection} />
            </>}
      </ScrollView>
      {detail ? <TeamDetailActionSheet detail={detail} actions={actions} invitations={controller.invitations} /> : null}
    </Box>
  );
}
