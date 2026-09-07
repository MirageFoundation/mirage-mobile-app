import * as Sentry from "@sentry/react-native";
import { useCallback, useMemo, useState } from "react";

import { useInfiniteCreatorEarnings } from "@/src/api/read/hooks/use-creator-earnings";
import { useClaimCreatorRewards } from "@/src/api/write/hooks/use-claim-creator-rewards";
import { isExpectedCreatorClaimError } from "@/src/api/write/utils/creator-claim-model";
import {
  isCreatorEarningClaimable,
  nextClaimSelection,
  normalizeClaimEpochs,
  sumRemainingAmounts,
  type CreatorClaimPhase,
  type CreatorEarningItem,
  type CreatorEarningsTab,
} from "@/src/domain/creator-earnings";
import { useAuthStore } from "@/src/stores";

function flattenItems(
  data: { pages: { items: CreatorEarningItem[] }[] } | undefined,
): CreatorEarningItem[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export function useCreatorEarningsController() {
  const creator = useAuthStore((s) => s.walletAddress)?.trim().toLowerCase() ?? "";
  const [tab, setTab] = useState<CreatorEarningsTab>("claimable");
  const [selected, setSelected] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [phase, setPhase] = useState<CreatorClaimPhase>("idle");
  const [session, setSession] = useState<{ txHash: string; epochIds: number[] } | null>(null);
  const [inlineError, setInlineError] = useState("");

  const claimableQuery = useInfiniteCreatorEarnings(creator, {
    claimable_only: true,
    sort: "claim_deadline_asc",
  });
  const historyQuery = useInfiniteCreatorEarnings(creator, {
    claimable_only: false,
    sort: "epoch_desc",
  });

  const claimableItems = useMemo(
    () => flattenItems(claimableQuery.data).filter((item) => isCreatorEarningClaimable(item)),
    [claimableQuery.data],
  );
  const historyItems = useMemo(() => flattenItems(historyQuery.data), [historyQuery.data]);
  const items = tab === "claimable" ? claimableItems : historyItems;
  const activeQuery = tab === "claimable" ? claimableQuery : historyQuery;
  const schedule = (tab === "claimable" ? claimableQuery.data : historyQuery.data)?.pages[0];
  const maxClaimEpochs = schedule?.max_creator_claim_epochs ?? null;
  const epochSeconds = schedule?.creator_epoch_seconds ?? null;

  const claim = useClaimCreatorRewards({
    onPhase: setPhase,
  });

  const selectionAtCap =
    maxClaimEpochs != null && selected.length >= maxClaimEpochs;

  const toggleEpoch = useCallback((epochId: number) => {
    if (maxClaimEpochs == null) return;
    const next = nextClaimSelection(selected, epochId, maxClaimEpochs);
    if (next.atCap) {
      setInlineError(`You can claim at most ${maxClaimEpochs} epochs at once`);
      return;
    }
    setInlineError("");
    setSelected(next.selected);
  }, [maxClaimEpochs, selected]);

  const toggleExpand = useCallback((epochId: number) => {
    setExpanded((current) => (current === epochId ? null : epochId));
  }, []);

  const retainedSelection = session != null;
  const selectedRemaining = useMemo(() => {
    const chosen = claimableItems.filter((item) => selected.includes(item.epoch_id));
    return sumRemainingAmounts(chosen);
  }, [claimableItems, selected]);

  const claimLabel = useMemo(() => {
    if (phase === "submitting") return "Submitting…";
    if (phase === "confirming") return "Confirming…";
    if (phase === "delivered_syncing") return "Indexing claim…";
    if (phase === "confirming_timeout") return "Submitted, confirmation pending";
    if (phase === "delivered_syncing_timeout") return "Accepted, still indexing";
    if (selected.length === 0) return "Claim";
    return `Claim ${selected.length} reward${selected.length === 1 ? "" : "s"}`;
  }, [phase, selected.length]);

  const runClaim = useCallback(async (resume = false) => {
    if (maxClaimEpochs == null) return;
    const epochIds = resume && session
      ? session.epochIds
      : normalizeClaimEpochs(selected, maxClaimEpochs);
    setInlineError("");
    try {
      const result = await claim.mutateAsync({
        epochIds,
        maxClaimEpochs,
        resumeTxHash: resume ? session?.txHash : undefined,
      });
      if (result.phase === "settled") {
        setSession(null);
        setSelected([]);
        setPhase("settled");
        Sentry.addBreadcrumb({
          category: "creator-earnings",
          message: "Creator claim settled",
          level: "info",
          data: { txHash: result.txHash, epochIds: result.epochIds },
        });
        return;
      }
      setSession({ txHash: result.txHash, epochIds: result.epochIds });
      setPhase(result.phase);
      Sentry.addBreadcrumb({
        category: "creator-earnings",
        message: `Creator claim ${result.phase}`,
        level: "info",
        data: { txHash: result.txHash, epochIds: result.epochIds },
      });
    } catch (error) {
      if (isExpectedCreatorClaimError(error)) {
        setInlineError(error instanceof Error ? error.message : String(error));
        setPhase("idle");
        return;
      }
      setInlineError(error instanceof Error ? error.message : "Claim failed");
      setPhase("idle");
    }
  }, [claim, maxClaimEpochs, selected, session]);

  return {
    creator,
    tab,
    setTab,
    items,
    claimableItems,
    selected,
    selectionAtCap,
    toggleEpoch,
    expanded,
    toggleExpand,
    maxClaimEpochs,
    epochSeconds,
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    refetch: activeQuery.refetch,
    hasNextPage: activeQuery.hasNextPage,
    isFetchingNextPage: activeQuery.isFetchingNextPage,
    fetchNextPage: activeQuery.fetchNextPage,
    phase,
    session,
    retainedSelection,
    inlineError,
    claimLabel,
    selectedRemaining,
    runClaim,
    claiming: claim.isPending,
  };
}
