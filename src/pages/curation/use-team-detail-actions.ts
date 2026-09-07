import { useEffect, useRef, useState } from "react";
import { useIsFocused } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { CuratorInviteTargetError, resolveCuratorInviteTarget } from "@/src/api/read/resolve-curator-invite-target";
import { authSessionCoordinator } from "@/src/services/auth-session-coordinator";
import { useAuthStore } from "@/src/stores/auth-store";
import { usePreferencesStore } from "@/src/stores/preferences-store";
import {
  useDeleteCurationTeam, useInviteCurator, useLeaveCurationTeam, useRemoveCurator,
  useRevokeCuratorInvite, useSetCurationSubscriberOnly, useSetCurationTag,
  useSetCurationTeamProfile, useTransferCurationTeam,
} from "@/src/api/write";
import { checkTeamDetailSettlement } from "@/src/api/write/utils/check-team-detail-settlement";
import { applyCurationSettledEffects } from "@/src/api/write/utils/curation-settled-effects";
import type { SettledCurationWriteResult } from "@/src/api/write/utils/curation-model";
import type { CurationTeamDetail, TeamInvitation } from "@/src/domain/communities";
import { useToast } from "@/src/providers/toast-provider";
import { parseApiError } from "@/src/utils/parse-api-error";
import { TEAM_ACTION_SUCCESS, teamActionAllowed, teamActionValidation, type TeamAction, type TeamActionDraft } from "./team-detail-action-model";

const EMPTY_DRAFT: TeamActionDraft = { name: "", description: "", target: "", enabled: false, tag: "", confirmation: "" };

export function useTeamDetailActions({ slug, teamId, detail, viewer, invitations, onExit }: {
  slug: string; teamId: number | null; detail?: CurationTeamDetail; viewer: string | null;
  invitations: TeamInvitation[]; onExit: () => void;
}) {
  const profile = useSetCurationTeamProfile();
  const invite = useInviteCurator();
  const revoke = useRevokeCuratorInvite();
  const leave = useLeaveCurationTeam();
  const remove = useRemoveCurator();
  const transfer = useTransferCurationTeam();
  const deletion = useDeleteCurationTeam();
  const audience = useSetCurationSubscriberOnly();
  const tag = useSetCurationTag();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<TeamAction | null>(null);
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);
  const delivered = useRef<SettledCurationWriteResult | null>(null);
  const focused = useIsFocused();
  const server = usePreferencesStore(state => state.apiServer);
  const latest = useRef({ slug, teamId, viewer, draft, detail, invitations, focused, server });
  latest.current = { slug, teamId, viewer, draft, detail, invitations, focused, server };
  const mounted = useRef(true);
  const resolving = useRef(false);
  const attempt = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => {
    if (!resolving.current) return;
    attempt.current++;
    resolving.current = false;
    busy.current = false;
    if (mounted.current) setPending(false);
  }, [focused, slug, teamId, viewer, server]);

  function cancelResolution() {
    if (!resolving.current) return;
    attempt.current++;
    resolving.current = false;
    busy.current = false;
    setPending(false);
  }

  function open(next: TeamAction, target = "") {
    if (busy.current) return;
    if (delivered.current) { setVisible(true); return; }
    if (!teamActionAllowed(next, detail, viewer)) return;
    if (next !== action || (target && target !== draft.target)) {
      setDraft({ ...EMPTY_DRAFT, name: detail!.name, description: detail!.description, enabled: detail!.subscriber_only, tag: detail!.tag, target });
    }
    setAction(next);
    setVisible(true);
  }

  function finish(completed: Exclude<TeamAction, "advanced">) {
    delivered.current = null;
    busy.current = false;
    setPending(false);
    setSyncing(false);
    setVisible(false);
    setAction(null);
    setDraft(EMPTY_DRAFT);
    toast.success(TEAM_ACTION_SUCCESS[completed]);
    if (completed === "delete" || completed === "leave") onExit();
  }

  function submit() {
    if (busy.current || delivered.current || !action || action === "advanced" || !detail || teamId == null) return;
    if (!teamActionAllowed(action, detail, viewer)) { toast.error("Action not permitted"); return; }
    const validation = action === "invite" ? null : teamActionValidation(action, draft, detail, invitations);
    if (validation) { toast.error(validation); return; }
    busy.current = true;
    setPending(true);
    const submittedAction = action;
    const callbacks = {
      onSuccess: (result: SettledCurationWriteResult) => {
        if (result.settlement.status === "settled") { finish(submittedAction); return; }
        delivered.current = result;
        busy.current = false;
        setPending(false);
        setSyncing(true);
        toast.info("Changes still syncing");
      },
      onError: (error: unknown) => {
        busy.current = false;
        setPending(false);
        const parsed = parseApiError(error);
        toast.error(parsed.errorCode === "not_subscriber" ? parsed.message : "Team update failed");
      },
    };
    const base = { community: slug, teamId };
    if (action === "invite") {
      const id = ++attempt.current;
      const session = authSessionCoordinator.current();
      const auth = useAuthStore.getState();
      const current = () => mounted.current && id === attempt.current && latest.current.focused &&
        latest.current.slug === slug && latest.current.teamId === teamId && latest.current.viewer === viewer &&
        latest.current.draft.target === draft.target && latest.current.server === server &&
        usePreferencesStore.getState().apiServer === server &&
        useAuthStore.getState().walletAddress === viewer && useAuthStore.getState().isLoggedIn &&
        !useAuthStore.getState().isInitializing && !useAuthStore.getState().isBootstrapping &&
        authSessionCoordinator.matches(session, viewer);
      const release = () => {
        if (!mounted.current || id !== attempt.current) return;
        resolving.current = false;
        busy.current = false;
        setPending(false);
      };
      if (!focused || auth.isInitializing || auth.isBootstrapping || !auth.isLoggedIn || !current()) {
        release(); toast.error("Wallet not ready"); return;
      }
      resolving.current = true;
      return resolveCuratorInviteTarget(queryClient, draft.target).then(target => {
        if (!current()) { release(); return; }
        const state = latest.current;
        if (!teamActionAllowed("invite", state.detail, viewer)) throw new CuratorInviteTargetError("Action not permitted");
        const error = teamActionValidation("invite", { ...draft, target }, state.detail!, state.invitations);
        if (error) throw new CuratorInviteTargetError(error);
        resolving.current = false;
        invite.mutate({ ...base, target }, {
          onSuccess: result => { if (current()) callbacks.onSuccess(result); else release(); },
          onError: error => { if (current()) callbacks.onError(error); else release(); },
        });
      }).catch(error => {
        if (current()) toast.error(error instanceof CuratorInviteTargetError ? error.message : "Invite preparation failed");
        release();
      });
    }
    switch (action) {
      case "profile": profile.mutate({ ...base, name: draft.name.trim(), description: draft.description }, callbacks); break;
      case "revoke": revoke.mutate({ ...base, target: draft.target.trim() }, callbacks); break;
      case "leave": leave.mutate({ ...base, owner: detail.owner }, callbacks); break;
      case "remove": remove.mutate({ ...base, owner: detail.owner, target: draft.target.trim() }, callbacks); break;
      case "transfer": transfer.mutate({ ...base, newOwner: draft.target.trim() }, callbacks); break;
      case "delete": deletion.mutate(base, callbacks); break;
      case "audience": audience.mutate({ ...base, enabled: draft.enabled }, callbacks); break;
      case "tag": tag.mutate({ ...base, tag: draft.tag }, callbacks); break;
    }
  }

  async function checkStatus() {
    const result = delivered.current;
    if (!result || busy.current || !viewer || !action || action === "advanced") return;
    busy.current = true;
    setPending(true);
    try {
      if (await checkTeamDetailSettlement(result, viewer)) {
        applyCurationSettledEffects(queryClient, { ...result, settlement: { status: "settled" } }, viewer);
        finish(action);
      } else toast.info("Changes still syncing");
    } catch {
      toast.error("Sync check failed");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return {
    action, visible, draft, pending, syncing,
    resolvingTarget: pending && resolving.current,
    locked: pending || syncing,
    open, submit, checkStatus,
    close: () => { cancelResolution(); if (!busy.current) setVisible(false); },
    updateDraft: (patch: Partial<TeamActionDraft>) => { cancelResolution(); if (!busy.current && !delivered.current) setDraft(value => ({ ...value, ...patch })); },
    resume: () => setVisible(true),
  };
}

export type TeamDetailActions = ReturnType<typeof useTeamDetailActions>;
