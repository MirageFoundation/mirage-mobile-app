import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnistyles } from "react-native-unistyles";

import { Box, Button, Text } from "@/src/components/ui/primitives";
import { formatMirageAmount } from "@/src/domain/creator-earnings";
import { CreatorEarningsRow } from "./creator-earnings-row";
import { styles } from "./creator-earnings-styles";
import { useCreatorEarningsController } from "./use-creator-earnings-controller";

function claimPhaseHint(phase: string): string {
  switch (phase) {
    case "submitting":
      return "Submitting claim…";
    case "confirming":
      return "Waiting for chain confirmation…";
    case "delivered_syncing":
      return "Claim delivered. Waiting for claimed height…";
    case "confirming_timeout":
      return "Submitted. Confirmation is still pending. Check again without resubmitting.";
    case "delivered_syncing_timeout":
      return "Accepted on-chain, indexing is still catching up. Check again without resubmitting.";
    case "aborted":
      return "Claim paused. Check again to resume confirmation.";
    case "settled":
      return "Claim settled.";
    default:
      return "";
  }
}

export function CreatorEarningsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useUnistyles();
  const state = useCreatorEarningsController();
  const hint = claimPhaseHint(state.phase);

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
          <Pressable onPress={router.back} hitSlop={8} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.default} />
          </Pressable>
          <Text size="xl" weight="bold">Creator Earnings</Text>
        </View>
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, state.tab === "claimable" && styles.tabActive]}
            onPress={() => state.setTab("claimable")}
          >
            <Text weight={state.tab === "claimable" ? "bold" : "medium"}>Claimable</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, state.tab === "history" && styles.tabActive]}
            onPress={() => state.setTab("history")}
          >
            <Text weight={state.tab === "history" ? "bold" : "medium"}>History</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 104,
          paddingBottom: insets.bottom + 120,
        }}
      >
        {state.isLoading ? (
          <Box style={styles.empty}><Text mode="subtle">Loading earnings…</Text></Box>
        ) : state.isError ? (
          <Box style={styles.empty}>
            <Text>Failed to load earnings</Text>
            <Pressable onPress={() => void state.refetch()}>
              <Text weight="semibold">Retry</Text>
            </Pressable>
          </Box>
        ) : state.items.length === 0 ? (
          <Box style={styles.empty}>
            <Text mode="subtle">
              {state.tab === "claimable" ? "No claimable earnings." : "No creator earnings yet."}
            </Text>
          </Box>
        ) : (
          state.items.map((item) => (
            <CreatorEarningsRow
              key={item.epoch_id}
              item={item}
              creator={state.creator}
              canSelect={state.tab === "claimable"}
              selected={state.selected.includes(item.epoch_id)}
              selectionAtCap={state.selectionAtCap}
              epochSeconds={state.epochSeconds}
              expanded={state.expanded === item.epoch_id}
              onToggle={() => state.toggleEpoch(item.epoch_id)}
              onToggleExpand={() => state.toggleExpand(item.epoch_id)}
            />
          ))
        )}
        {state.hasNextPage ? (
          <Box center p="lg">
            <Pressable
              onPress={() => void state.fetchNextPage()}
              disabled={state.isFetchingNextPage}
            >
              <Text weight="semibold">
                {state.isFetchingNextPage ? "Loading…" : "Load more"}
              </Text>
            </Pressable>
          </Box>
        ) : null}
        {state.inlineError ? (
          <Box p="lg"><Text mode="error">{state.inlineError}</Text></Box>
        ) : null}
        {hint ? (
          <Box px="lg" pt="sm"><Text size="sm" mode="subtle">{hint}</Text></Box>
        ) : null}
      </ScrollView>
      {state.tab === "claimable" ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {state.selected.length > 0 ? (
            <Text size="sm" mode="subtle">
              {formatMirageAmount(state.selectedRemaining)} selected
            </Text>
          ) : null}
          {state.retainedSelection ? (
            <Button
              onPress={() => void state.runClaim(true)}
              loading={state.claiming}
              disabled={state.claiming}
            >
              <Button.Text>Check again</Button.Text>
            </Button>
          ) : (
            <Button
              onPress={() => void state.runClaim(false)}
              loading={state.claiming}
              disabled={state.claiming || state.selected.length === 0 || state.maxClaimEpochs == null}
            >
              <Button.Text>{state.claimLabel}</Button.Text>
            </Button>
          )}
        </View>
      ) : null}
    </Box>
  );
}
