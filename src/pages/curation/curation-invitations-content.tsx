import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { useCuratorInvitations } from "@/src/api/read";
import { useAcceptCuratorInvite, useDeclineCuratorInvite } from "@/src/api/write";
import { Box, Text } from "@/src/components/ui/primitives";
import { communityLabel } from "@/src/domain/communities";
import { useAuthStore } from "@/src/stores";
import { styles } from "./community-teams-styles";

export function CurationInvitationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useUnistyles();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const { data, isLoading, isError, refetch } = useCuratorInvitations(walletAddress);
  const accept = useAcceptCuratorInvite();
  const decline = useDeclineCuratorInvite();
  const items = data?.items ?? [];

  return (
    <Box flex background="base">
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
            backgroundColor: theme.colors.background.default,
            borderBottomColor: theme.colors.border.subtle,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={router.back} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
          </Pressable>
          <Text size="xl" weight="bold">Curator invitations</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 56,
          paddingBottom: insets.bottom + 32,
        }}
      >
        {isLoading ? (
          <Box center p="lg"><Text mode="subtle">Loading…</Text></Box>
        ) : isError ? (
          <Box center p="lg">
            <Text>Failed to load invitations</Text>
            <Pressable onPress={() => void refetch()}><Text weight="semibold">Retry</Text></Pressable>
          </Box>
        ) : items.length === 0 ? (
          <Box center p="lg"><Text mode="subtle">No pending invitations</Text></Box>
        ) : (
          items.map((item) => (
            <View key={`${item.community}:${item.team_id}`} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text size="md" weight="semibold">
                  {item.name} · {communityLabel(item.community)}
                </Text>
                <Text size="sm" mode="subtle">
                  From {item.inviter_username || item.inviter}
                </Text>
                <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                  <Pressable
                    onPress={() =>
                      accept.mutate({ community: item.community, teamId: item.team_id })
                    }
                  >
                    <Text size="sm" weight="bold">Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      decline.mutate({ community: item.community, teamId: item.team_id })
                    }
                  >
                    <Text size="sm" weight="semibold">Decline</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Box>
  );
}
