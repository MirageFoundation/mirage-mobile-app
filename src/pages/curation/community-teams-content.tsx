import { useLocalSearchParams } from "expo-router";
import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Box, Text } from "@/src/components/ui/primitives";
import { CommunityTeamsCreate } from "./community-teams-create";
import { CommunityTeamsHeader } from "./community-teams-header";
import { CommunityTeamsRow } from "./community-teams-row";
import { useCommunityTeamsController } from "./use-community-teams-controller";

const HEADER_HEIGHT = 56;

export function CommunityTeamsScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slugParam = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useUnistyles();
  const controller = useCommunityTeamsController(slugParam);

  const ListEmpty = useCallback(() => {
    if (!controller.isValidSlug) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 80 }}>
          <Text size="lg" weight="medium">Community not found</Text>
        </Box>
      );
    }
    if (controller.isLoading) return null;
    if (controller.isError) {
      return (
        <Box flex center p="lg" style={{ paddingTop: 80 }}>
          <Text size="lg" weight="medium">Failed to load teams</Text>
          <Pressable onPress={() => void controller.refetch()} style={{ marginTop: 12 }}>
            <Text size="sm" weight="semibold">Retry</Text>
          </Pressable>
        </Box>
      );
    }
    return (
      <Box flex center p="lg" style={{ paddingTop: 80 }}>
        <Text size="lg" weight="medium" mode="subtle">No teams yet</Text>
      </Box>
    );
  }, [controller]);

  return (
    <Box flex background="base">
      <CommunityTeamsHeader
        insetsTop={insets.top}
        communityName={controller.slug}
        onBack={router.back}
      />
      <FlatList
        data={controller.items}
        keyExtractor={(item) => item.team_id}
        renderItem={({ item }) => (
          <CommunityTeamsRow
            item={item}
            isViewerTeam={controller.viewerTeamIds.has(item.team_id)}
            onPress={() => controller.handleOpenTeam(item.team_id)}
          />
        )}
        ListHeaderComponent={controller.canCreate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={controller.creation.syncing ? "View pending team" : "Create team"}
            onPress={controller.creation.open}
            style={{ margin: 16, minHeight: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primary[500] }}
          >
            <Text size="sm" weight="bold" style={{ color: theme.colors.background.default }}>
              {controller.creation.syncing ? "View pending team" : "Create team"}
            </Text>
          </Pressable>
        ) : null}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_HEIGHT,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void controller.refetch()}
            tintColor={theme.colors.text.subtle}
            progressViewOffset={insets.top + HEADER_HEIGHT}
          />
        }
      />
      <CommunityTeamsCreate creation={controller.creation} />
      {controller.isLoading ? <View /> : null}
    </Box>
  );
}
