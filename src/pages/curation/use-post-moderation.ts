import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCuratorCommunities } from "@/src/api/read";
import { useSetCurationPostHidden, useSetCurationPostTag, useSetCurationThreadLocked, useSetCurationUserHidden } from "@/src/api/write";
import type { SettledCurationWriteResult } from "@/src/api/write/utils/curation-model";
import type { CuratorMembership, TeamModerationItem } from "@/src/domain/communities";
import { eligibleModerationTeam, type ModerationTarget } from "@/src/domain/communities/moderation-action";
import { useAuthStore, usePreferencesStore } from "@/src/stores";
import { useToast } from "@/src/providers/toast-provider";

type Selection = ModerationTarget & { community: string; teamId: number; teamName: string; scope: string };
type ActionState = { pending?: boolean; syncing?: boolean; error?: string; expected?: Partial<TeamModerationItem> };

export function usePostModeration(memberships?: readonly CuratorMembership[]) {
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const server = usePreferencesStore((s) => s.apiServer);
  const scope = `${server}:${walletAddress}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = ""; };
  }, [scope]);
  const toast = useToast();
  const curatorQuery = useCuratorCommunities(walletAddress, { enabled: !!walletAddress && !memberships });
  const resolvedMemberships = useMemo(() => memberships ?? curatorQuery.data?.memberships ?? [], [curatorQuery.data?.memberships, memberships]);
  const hidePost = useSetCurationPostHidden();
  const hideUser = useSetCurationUserHidden();
  const lockThread = useSetCurationThreadLocked();
  const setPostTag = useSetCurationPostTag();
  const [selection, setSelected] = useState<Selection | null>(null);
  const selected = selection?.scope === scope ? selection : null;
  const states = useRef(new Map<string, ActionState>());
  const [, refresh] = useState(0);
  const keyFor = (target: Selection) => `${target.scope}:${target.community}:${target.teamId}:${target.postId}`;
  const state = selected ? states.current.get(keyFor(selected)) ?? {} : {};
  const teamFor = useCallback((input: ModerationTarget) => eligibleModerationTeam(input, walletAddress, resolvedMemberships), [walletAddress, resolvedMemberships]);
  const open = useCallback((input: ModerationTarget) => {
    const team = teamFor(input);
    if (!team) return;
    setSelected({ ...input, community: team.community, teamId: team.team_id, teamName: team.name, scope });
  }, [scope, teamFor]);
  const close = useCallback(() => setSelected(null), []);

  const run = async (write: () => Promise<SettledCurationWriteResult>, expected: Partial<TeamModerationItem>) => {
    if (!selected || currentScope.current !== selected.scope || !teamFor(selected)) return;
    const key = keyFor(selected);
    const previous = states.current.get(key);
    if (previous?.pending || previous?.syncing) return;
    states.current.set(key, { pending: true, expected });
    refresh((n) => n + 1);
    try {
      const result = await write();
      if (currentScope.current !== selected.scope) return;
      const syncing = result.settlement.status !== "settled";
      states.current.set(key, { syncing, expected });
      if (!syncing) toast.success("Team moderation updated");
    } catch (error) {
      if (currentScope.current !== selected.scope) return;
      states.current.set(key, { error: error instanceof Error ? error.message.slice(0, 180) : "Moderation failed. Try again." });
    } finally {
      if (currentScope.current === selected.scope) refresh((n) => n + 1);
    }
  };
  const base = selected ? { community: selected.community, teamId: selected.teamId } : null;
  const actions = selected && base ? {
    hidePost: (hidden: boolean) => run(() => hidePost.mutateAsync({ ...base, target: selected.postId, hidden }), { post_hidden: hidden }),
    hideAuthor: (hidden: boolean) => run(() => hideUser.mutateAsync({ ...base, target: selected.authorId, hidden }), { user_hidden: hidden }),
    lockThread: (locked: boolean) => selected.rootHash ? run(() => lockThread.mutateAsync({ ...base, rootHash: selected.rootHash!, locked }), { thread_locked: locked }) : undefined,
    setPostTag: (tag: string, clear: boolean) => run(() => setPostTag.mutateAsync({ ...base, target: selected.postId, tag, clear }), { post_tag: clear ? null : tag }),
    clearPostTag: () => run(() => setPostTag.mutateAsync({ ...base, target: selected.postId, tag: "", clear: true }), { post_tag: null }),
  } : null;
  const confirmIndexed = (item?: TeamModerationItem) => {
    if (!selected || !item || currentScope.current !== selected.scope) return;
    const key = keyFor(selected);
    const pending = states.current.get(key);
    if (!pending?.syncing || !pending.expected) return;
    if (Object.entries(pending.expected).every(([field, value]) => item[field as keyof TeamModerationItem] === value)) {
      states.current.set(key, {});
      refresh((n) => n + 1);
      toast.success("Team moderation synced");
    }
  };
  return { memberships: resolvedMemberships, teamFor, canModerate: (input: ModerationTarget) => !!teamFor(input), selected, open, close, actions, state, confirmIndexed };
}
