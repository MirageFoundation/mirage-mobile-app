import { EvilIcons, Ionicons } from "@expo/vector-icons";
import { useRouter } from "@/src/navigation/guarded-router";
import * as Sentry from "@sentry/react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useAgents } from "@/src/api/read/hooks/use-agents";
import { useUserFollowed } from "@/src/api/read/hooks/use-user-lists";
import type { AgentInfo } from "@/src/api/read/endpoints/agents";
import { Box, Text } from "@/src/components/ui/primitives";
import { triggerHaptic } from "@/src/components/utils/haptics";
import {
  disableAgent as disableAgentApi,
  enableAgent as enableAgentApi,
  setAgents as setAgentsApi,
} from "@/src/api/write/endpoints/social";
import { useWallet } from "@/src/hooks/use-wallet";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { Avatar } from "@/src/components/atoms";
import {
  generateActionId,
  getActionLabel,
  usePowQueueStore,
} from "@/src/services/pow-queue";

function sameOrderedList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return "Inactive";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

type ListItem =
  | { type: "header" }
  | { type: "section"; title: string; count: number }
  | { type: "reorder-bar"; hasChanges: boolean }
  | { type: "agent"; agent: AgentInfo; isEnabled: boolean };

function AgentCard({
  agent,
  isEnabled,
  onToggle,
  isToggling,
  showReorder,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  agent: AgentInfo;
  isEnabled: boolean;
  onToggle: (agent: AgentInfo) => void;
  isToggling: boolean;
  showReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/user/${agent.address}`)}
      style={({ pressed }) => [
        styles.agentCard,
        {
          backgroundColor: theme.colors.background.default,
          borderColor: isEnabled ? "#EF4444" : theme.colors.border.subtle,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.agentHeader}>
        <Avatar
          seed={agent.address || agent.username}
          size={44}
          source={agent.avatar ? { uri: agent.avatar } : undefined}
        />
        <View style={styles.agentInfo}>
          <View style={styles.agentNameRow}>
            <Text
              size="md"
              weight="semibold"
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {agent.username || agent.address.slice(0, 12)}
            </Text>
            <View style={[styles.agentBadge, { backgroundColor: "#EF4444" }]}>
              <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
                Agent
              </Text>
            </View>
          </View>
          <Text size="xs" mode="subtle">
            {agent.last_active ? `Active ${formatTimeAgo(agent.last_active)}` : formatTimeAgo(agent.last_active)}
          </Text>
        </View>
      </View>

      {agent.biography ? (
        <View style={styles.agentBio}>
          <Text size="sm" weight="light">
            {agent.biography}
          </Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        {showReorder && (
          <View style={styles.reorderButtons}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onMoveUp?.();
              }}
              disabled={isFirst}
              style={({ pressed }) => [
                styles.reorderBtn,
                {
                  backgroundColor: theme.colors.background.subtle,
                  opacity: isFirst ? 0.3 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name="chevron-up"
                size={16}
                color={theme.colors.text.default}
              />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onMoveDown?.();
              }}
              disabled={isLast}
              style={({ pressed }) => [
                styles.reorderBtn,
                {
                  backgroundColor: theme.colors.background.subtle,
                  opacity: isLast ? 0.3 : pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name="chevron-down"
                size={16}
                color={theme.colors.text.default}
              />
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggle(agent);
          }}
          disabled={isToggling}
          style={({ pressed }) => [
            styles.toggleButton,
            {
              backgroundColor: isEnabled
                ? theme.colors.background.subtle
                : "#EF4444",
              opacity: isToggling ? 0.6 : pressed ? 0.8 : 1,
              flex: 1,
            },
          ]}
        >
          {isToggling ? (
            <ActivityIndicator
              size="small"
              color={isEnabled ? theme.colors.text.default : "#fff"}
            />
          ) : (
            <>
              <Ionicons
                name={
                  isEnabled
                    ? "close-circle-outline"
                    : "shield-checkmark-outline"
                }
                size={16}
                color={isEnabled ? theme.colors.text.default : "#fff"}
              />
              <Text
                size="sm"
                weight="semibold"
                style={{
                  color: isEnabled ? theme.colors.text.default : "#fff",
                }}
              >
                {isEnabled ? "Disable" : "Enable"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

export function AgentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  const { data: agentsData, isLoading: isLoadingAgents } = useAgents();
  const { data: followedData } = useUserFollowed();
  const enqueue = usePowQueueStore((state) => state.enqueue);
  const cancelAction = usePowQueueStore((state) => state.cancelAction);
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-agent in-flight toggle actions. Opposite toggles for the same agent can
  // cancel each other, while different agents still queue independently.
  const pendingToggleActionsRef = useRef<
    Map<string, { actionId: string; type: "enable_agent" | "disable_agent" }>
  >(new Map());
  const pendingOrderActionIdRef = useRef<string | null>(null);

  const serverEnabledList = useMemo(
    () => followedData?.enabled_agents ?? [],
    [followedData?.enabled_agents],
  );

  const currentEnabledList = localOrder ?? serverEnabledList;

  const enabledSet = useMemo(
    () => new Set(currentEnabledList),
    [currentEnabledList],
  );

  const hasOrderChanges = useMemo(() => {
    if (!localOrder) return false;
    if (localOrder.length !== serverEnabledList.length) return false;
    return localOrder.some((addr, i) => addr !== serverEnabledList[i]);
  }, [localOrder, serverEnabledList]);

  const agentMap = useMemo(() => {
    const map = new Map<string, AgentInfo>();
    for (const a of agentsData?.agents ?? []) map.set(a.address, a);
    return map;
  }, [agentsData?.agents]);

  const enabledAgentsList = useMemo(() => {
    return currentEnabledList
      .map((addr) => agentMap.get(addr))
      .filter(Boolean) as AgentInfo[];
  }, [currentEnabledList, agentMap]);

  const otherAgents = useMemo(() => {
    return (agentsData?.agents ?? []).filter((a) => !enabledSet.has(a.address));
  }, [agentsData?.agents, enabledSet]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    items.push({ type: "header" });

    if (enabledAgentsList.length > 0) {
      items.push({
        type: "section",
        title: "ENABLED AGENTS",
        count: enabledAgentsList.length,
      });
      if (enabledAgentsList.length > 1) {
        items.push({ type: "reorder-bar", hasChanges: hasOrderChanges });
      }
      for (const agent of enabledAgentsList) {
        items.push({ type: "agent", agent, isEnabled: true });
      }
    }

    items.push({
      type: "section",
      title: "ALL AGENTS",
      count: otherAgents.length,
    });
    for (const agent of otherAgents) {
      items.push({ type: "agent", agent, isEnabled: false });
    }

    return items;
  }, [enabledAgentsList, otherAgents, hasOrderChanges]);

  const moveAgent = useCallback(
    (agentAddr: string, direction: "up" | "down") => {
      const list = [...(localOrder ?? serverEnabledList)];
      const idx = list.indexOf(agentAddr);
      if (idx < 0) return;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= list.length) return;
      [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
      setLocalOrder(list);
      triggerHaptic("light");
    },
    [localOrder, serverEnabledList],
  );

  const updateEnabledAgentsCache = useCallback(
    (enabledAgents: string[]) => {
      if (!address) return;
      queryClient.setQueryData(
        queryKeys.userFollowed(address),
        (old: any) => {
          if (!old) {
            return {
              enabled_agents: enabledAgents,
              followed_topics: [],
              followed_users: [],
            };
          }
          return { ...old, enabled_agents: enabledAgents };
        },
      );
    },
    [address, queryClient],
  );

  // Always read the latest (optimistically-updated) enabled list so rapid
  // taps compute their next state from the freshest value, not a stale render
  // closure.
  const readEnabledListFromCache = useCallback((): string[] => {
    if (address) {
      const cached = queryClient.getQueryData<{ enabled_agents?: string[] }>(
        queryKeys.userFollowed(address),
      );
      if (cached?.enabled_agents) return cached.enabled_agents;
    }
    return serverEnabledList;
  }, [address, queryClient, serverEnabledList]);

  const scheduleAgentsInvalidation = useCallback(() => {
    const addr = address;
    invalidationTimerRef.current = setTimeout(() => {
      if (addr) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(addr),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(addr),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
    }, 15000);
  }, [address, queryClient]);

  const submitAgentToggle = useCallback(
    (
      agentAddress: string,
      newList: string[],
      previousList: string[],
      actionType: "enable_agent" | "disable_agent",
    ) => {
      if (invalidationTimerRef.current) {
        clearTimeout(invalidationTimerRef.current);
        invalidationTimerRef.current = null;
      }
      if (address) {
        void queryClient.cancelQueries({
          queryKey: queryKeys.userFollowed(address),
        });
      }

      const existing = pendingToggleActionsRef.current.get(agentAddress);
      if (existing) {
        pendingToggleActionsRef.current.delete(agentAddress);
        const cancelled = cancelAction(existing.actionId);
        Sentry.addBreadcrumb({
          category: "agents",
          message: "Superseded agent toggle cancelled",
          level: cancelled ? "info" : "warning",
          data: {
            previousActionId: existing.actionId,
            previousType: existing.type,
            nextType: actionType,
            enabledCount: newList.length,
            cancelled,
          },
        });
        if (!cancelled) {
          Sentry.captureMessage("Agent toggle cancel failed", {
            level: "warning",
            tags: { feature: "agents", operation: "cancel-toggle" },
            extra: {
              previousActionId: existing.actionId,
              previousType: existing.type,
              nextType: actionType,
            },
          });
        }
        updateEnabledAgentsCache(newList);
        setLocalOrder(null);
        triggerHaptic("light");
        return;
      }

      const previousIndex = previousList.indexOf(agentAddress);
      const actionId = generateActionId();
      pendingToggleActionsRef.current.set(agentAddress, { actionId, type: actionType });
      Sentry.addBreadcrumb({
        category: "agents",
        message: "Agent toggle enqueued",
        level: "info",
        data: {
          actionId,
          type: actionType,
          enabledCount: newList.length,
          previousEnabledCount: previousList.length,
        },
      });
      enqueue({
        id: actionId,
        type: actionType,
        label: getActionLabel(actionType),
        execute: async () => {
          const wallet = await getWallet();
          return actionType === "enable_agent"
            ? enableAgentApi(wallet, agentAddress)
            : disableAgentApi(wallet, agentAddress);
        },
        onOptimisticUpdate: () => {
          updateEnabledAgentsCache(newList);
        },
        onSuccess: () => {
          const pending = pendingToggleActionsRef.current.get(agentAddress);
          if (pending?.actionId === actionId) {
            pendingToggleActionsRef.current.delete(agentAddress);
          }
          Sentry.addBreadcrumb({
            category: "agents",
            message: "Agent toggle succeeded",
            level: "info",
            data: { actionId, type: actionType, enabledCount: newList.length },
          });
          triggerHaptic("success");
          scheduleAgentsInvalidation();
        },
        onError: (error) => {
          Sentry.captureException(error, {
            tags: { feature: "agents", operation: actionType },
          });
          triggerHaptic("error");
        },
        onRollback: () => {
          const pending = pendingToggleActionsRef.current.get(agentAddress);
          if (pending?.actionId !== actionId) return;
          pendingToggleActionsRef.current.delete(agentAddress);
          Sentry.addBreadcrumb({
            category: "agents",
            message: "Agent toggle rolled back",
            level: "warning",
            data: { actionId, type: actionType },
          });
          const current = readEnabledListFromCache();
          const rolledBack = actionType === "enable_agent"
            ? current.filter((addr) => addr !== agentAddress)
            : (() => {
                const withoutAgent = current.filter((addr) => addr !== agentAddress);
                const next = [...withoutAgent];
                next.splice(
                  previousIndex >= 0 ? Math.min(previousIndex, next.length) : next.length,
                  0,
                  agentAddress,
                );
                return next;
              })();
          updateEnabledAgentsCache(rolledBack);
        },
      });
    },
    [
      address,
      cancelAction,
      enqueue,
      getWallet,
      queryClient,
      readEnabledListFromCache,
      scheduleAgentsInvalidation,
      updateEnabledAgentsCache,
    ],
  );

  const submitAgentOrder = useCallback(
    (newList: string[], previousList: string[]) => {
      if (invalidationTimerRef.current) {
        clearTimeout(invalidationTimerRef.current);
        invalidationTimerRef.current = null;
      }
      if (address) {
        void queryClient.cancelQueries({
          queryKey: queryKeys.userFollowed(address),
        });
      }
      if (sameOrderedList(newList, previousList)) return;

      if (pendingOrderActionIdRef.current) {
        const previousActionId = pendingOrderActionIdRef.current;
        const cancelled = cancelAction(previousActionId);
        Sentry.addBreadcrumb({
          category: "agents",
          message: "Superseded agent order update cancelled",
          level: cancelled ? "info" : "warning",
          data: { previousActionId, enabledCount: newList.length, cancelled },
        });
        if (!cancelled) {
          Sentry.captureMessage("Agent order cancel failed", {
            level: "warning",
            tags: { feature: "agents", operation: "cancel-order" },
            extra: { previousActionId, enabledCount: newList.length },
          });
        }
        pendingOrderActionIdRef.current = null;
      }

      const actionId = generateActionId();
      pendingOrderActionIdRef.current = actionId;
      Sentry.addBreadcrumb({
        category: "agents",
        message: "Agent order update enqueued",
        level: "info",
        data: {
          actionId,
          enabledCount: newList.length,
          previousEnabledCount: previousList.length,
        },
      });
      enqueue({
        id: actionId,
        type: "set_agents",
        label: getActionLabel("set_agents"),
        execute: async () => {
          const wallet = await getWallet();
          return setAgentsApi(wallet, newList);
        },
        onOptimisticUpdate: () => {
          updateEnabledAgentsCache(newList);
        },
        onSuccess: () => {
          if (pendingOrderActionIdRef.current === actionId) {
            pendingOrderActionIdRef.current = null;
          }
          setLocalOrder(null);
          Sentry.addBreadcrumb({
            category: "agents",
            message: "Agent order update succeeded",
            level: "info",
            data: { actionId, enabledCount: newList.length },
          });
          triggerHaptic("success");
          scheduleAgentsInvalidation();
        },
        onError: (error) => {
          if (pendingOrderActionIdRef.current === actionId) {
            pendingOrderActionIdRef.current = null;
          }
          Sentry.captureException(error, {
            tags: { feature: "agents", operation: "set-agents" },
          });
          triggerHaptic("error");
        },
        onRollback: () => {
          if (pendingOrderActionIdRef.current === actionId) {
            pendingOrderActionIdRef.current = null;
            Sentry.addBreadcrumb({
              category: "agents",
              message: "Agent order update rolled back",
              level: "warning",
              data: { actionId, enabledCount: previousList.length },
            });
            updateEnabledAgentsCache(previousList);
          }
        },
      });
    },
    [
      address,
      cancelAction,
      enqueue,
      getWallet,
      queryClient,
      scheduleAgentsInvalidation,
      updateEnabledAgentsCache,
    ],
  );

  const handleToggleAgent = useCallback(
    (agent: AgentInfo) => {
      const current = readEnabledListFromCache();
      const isCurrentlyEnabled = current.includes(agent.address);
      const newList = isCurrentlyEnabled
        ? current.filter((a) => a !== agent.address)
        : [...current, agent.address];

      triggerHaptic("medium");
      setLocalOrder(null);
      requestAnimationFrame(() => {
        submitAgentToggle(
          agent.address,
          newList,
          current,
          isCurrentlyEnabled ? "disable_agent" : "enable_agent",
        );
      });
    },
    [readEnabledListFromCache, submitAgentToggle],
  );

  const handleApplyOrder = useCallback(() => {
    if (!localOrder || !hasOrderChanges) return;
    const previousList = readEnabledListFromCache();
    const orderToApply = localOrder;
    triggerHaptic("medium");
    setTogglingAgent("__reorder__");
    requestAnimationFrame(() => {
      submitAgentOrder(orderToApply, previousList);
      setTogglingAgent(null);
    });
  }, [localOrder, hasOrderChanges, readEnabledListFromCache, submitAgentOrder]);

  const handleBack = useCallback(() => {
    triggerHaptic("light");
    router.back();
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return (
          <Box px="md" pt="md" pb="md">
            <View style={styles.introTitle}>
              <Text size="md" weight="light" mode="subtle">
                <Text size="md" weight="semibold">
                  Mirage has no built-in moderation
                </Text>{" "}
                — all content lives on-chain unaltered.
              </Text>
            </View>
            <View style={styles.introBody}>
              <Text size="md" weight="light" mode="subtle">
                <Text size="md" weight="semibold">
                  Anyone
                </Text>{" "}
                can create an agent that filters spam, fixes tags, translates
                posts, or curates however they see fit. You choose which ones to
                trust, and your feed reflects their work while the originals
                stay untouched.
              </Text>
            </View>
            <View style={styles.introFooter}>
              <Text size="md" weight="light" mode="subtle">
                The result is an open marketplace of moderation where quality
                rises through competition, not central authority.
              </Text>
            </View>
          </Box>
        );
      }

      if (item.type === "section") {
        return (
          <View style={styles.sectionRow}>
            <Text size="sm" weight="semibold" style={styles.sectionLabel}>
              {item.title}
            </Text>
            <View
              style={[
                styles.countBadge,
                { backgroundColor: theme.colors.background.subtle },
              ]}
            >
              <Text size="sm" weight="semibold" mode="subtle">
                {item.count}
              </Text>
            </View>
          </View>
        );
      }

      if (item.type === "reorder-bar") {
        return (
          <View style={styles.reorderBar}>
            <Ionicons
              name="swap-vertical"
              size={18}
              color={theme.colors.text.subtle}
            />
            <Text size="xs" mode="subtle" style={{ flex: 1 }}>
              Order matters. When two agents edit the same field, the one higher
              in your list wins.
            </Text>
            <Pressable
              onPress={handleApplyOrder}
              disabled={!item.hasChanges || togglingAgent === "__reorder__"}
              style={({ pressed }) => [
                styles.applyButton,
                {
                  opacity: !item.hasChanges
                    ? 0.35
                    : togglingAgent === "__reorder__"
                      ? 0.5
                      : pressed
                        ? 0.8
                        : 1,
                },
              ]}
            >
              {togglingAgent === "__reorder__" ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text size="xs" weight="semibold" style={{ color: "#fff" }}>
                  Apply Order
                </Text>
              )}
            </Pressable>
          </View>
        );
      }

      return (
        <AgentCard
          agent={item.agent}
          isEnabled={item.isEnabled}
          onToggle={handleToggleAgent}
          isToggling={togglingAgent === item.agent.address}
          showReorder={item.isEnabled && enabledAgentsList.length > 1}
          onMoveUp={() => moveAgent(item.agent.address, "up")}
          onMoveDown={() => moveAgent(item.agent.address, "down")}
          isFirst={enabledAgentsList[0]?.address === item.agent.address}
          isLast={
            enabledAgentsList[enabledAgentsList.length - 1]?.address ===
            item.agent.address
          }
        />
      );
    },
    [
      theme,
      handleToggleAgent,
      handleApplyOrder,
      togglingAgent,
      enabledAgentsList,
      moveAgent,
    ],
  );

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    if (item.type === "header") return "header";
    if (item.type === "section") return `section-${item.title}`;
    if (item.type === "reorder-bar") return "reorder-bar";
    return item.agent.address;
  }, []);

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
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.7 },
          ]}
        >
          <EvilIcons name="close" size={28} color={theme.colors.text.default} />
        </Pressable>
        <Text size="lg" weight="medium">
          Agents
        </Text>
        <View style={styles.headerRight} />
      </View>

      {isLoadingAgents ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.text.subtle} />
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        />
      )}

    </Box>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    marginBottom: theme.spacing.sm,
  },
  introBody: {
    marginBottom: theme.spacing.sm,
  },
  introFooter: {
    marginBottom: theme.spacing.sm,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  sectionLabel: {
    letterSpacing: 0.5,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.full,
  },
  reorderBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: 6,
  },
  applyButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  agentCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  agentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  agentInfo: {
    flex: 1,
    gap: 2,
  },
  agentNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  agentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  agentBio: {
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  reorderButtons: {
    flexDirection: "row",
    gap: 4,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
}));
