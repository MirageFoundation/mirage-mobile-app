import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router/react-navigation";
import { useBatchTeamModeration } from "@/src/api/read/hooks/use-curation";
import { usePostModeration } from "@/src/pages/curation/use-post-moderation";
import { PostModerationMenu } from "@/src/pages/curation/post-moderation-sheet";
import type { ModerationTarget } from "@/src/domain/communities/moderation-action";
import type { CuratorMembership } from "@/src/domain/communities";

type ContextValue = {
  register: (target: ModerationTarget) => () => void;
  open: (target: ModerationTarget) => void;
  teamFor: (target: ModerationTarget) => CuratorMembership | undefined;
  root?: ModerationTarget;
};
const ModerationContext = createContext<ContextValue | null>(null);

export function ModerationProvider({ children, root, fullscreen = false }: { children: ReactNode; root?: ModerationTarget; fullscreen?: boolean }) {
  const focused = useIsFocused();
  const moderation = usePostModeration();
  const registered = useRef(new Map<symbol, ModerationTarget>());
  const [snapshot, setSnapshot] = useState<ModerationTarget[]>([]);
  const [checking, setChecking] = useState(false);
  const register = useCallback((target: ModerationTarget) => {
    const key = Symbol();
    registered.current.set(key, target);
    return () => { registered.current.delete(key); };
  }, []);
  const open = (target: ModerationTarget) => {
    if (!focused || !moderation.teamFor(target)) return;
    setSnapshot([...registered.current.values(), target].filter((item) => !!moderation.teamFor(item)));
    moderation.open(target);
  };
  const batch = useBatchTeamModeration(useMemo(() => snapshot.map((target) => ({ post_id: target.postId, community: target.community, lens: target.lens })), [snapshot]), { memberships: moderation.memberships, enabled: focused && !!moderation.selected });
  const selected = moderation.selected;
  const readError = batch.queries.some((query) => query.isError);
  const overlay = selected ? batch.itemsByPostId.get(selected.postId.toLowerCase()) : undefined;
  const retry = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const results = await Promise.all(batch.queries.map((query) => query.refetch()));
      const item = results.flatMap((result) => result.isError ? [] : result.data?.items ?? []).find((row) => row.post_id === selected?.postId.toLowerCase());
      moderation.confirmIndexed(item);
    } finally { setChecking(false); }
  };
  return (
    <ModerationContext.Provider value={{ register, open, teamFor: moderation.teamFor, root }}>
      {children}
      <PostModerationMenu visible={focused && !!selected} teamName={selected?.teamName ?? ""} community={selected?.community ?? ""} fullscreen={fullscreen}
        overlay={overlay} readError={readError} loading={checking || batch.queries.some((query) => query.isFetching)} pending={moderation.state.pending} syncing={moderation.state.syncing} error={moderation.state.error}
        canLock={!!selected?.rootHash} onRetry={() => { void retry(); }}
        onHidePost={(hidden) => { void moderation.actions?.hidePost(hidden); }} onHideAuthor={(hidden) => { void moderation.actions?.hideAuthor(hidden); }}
        onLockThread={(locked) => { void moderation.actions?.lockThread(locked); }} onSetPostTag={(tag, clear) => { void moderation.actions?.setPostTag(tag, clear); }}
        onClearPostTag={() => { void moderation.actions?.clearPostTag(); }} onClose={moderation.close} />
    </ModerationContext.Provider>
  );
}

export function ModerationButton({ target, color = "#EF4444", size = 16, disabled }: { target?: ModerationTarget; color?: string; size?: number; disabled?: boolean }) {
  const context = useContext(ModerationContext);
  const resolved = useMemo(() => target ? {
    ...target,
    community: target.community ?? context?.root?.community,
    lens: target.lens ?? context?.root?.lens,
    rootHash: target.rootHash !== undefined ? target.rootHash : (context?.root ? context.root.rootHash : target.postId),
  } : undefined, [target, context?.root]);
  const register = context?.register;
  useEffect(() => resolved && register ? register(resolved) : undefined, [register, resolved]);
  const team = resolved && context?.teamFor(resolved);
  if (!team || !resolved) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Moderate for ${team.name}`} disabled={disabled} onPress={(event) => { event.stopPropagation(); context?.open(resolved); }} hitSlop={6} style={{ padding: 7, borderWidth: 0.5, borderColor: color, borderRadius: 24, opacity: disabled ? 0.5 : 1 }}>
    <Ionicons name="shield-checkmark-outline" size={size} color={color} />
  </Pressable>;
}
