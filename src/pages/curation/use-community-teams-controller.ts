import { useRouter } from "@/src/navigation/guarded-router";
import { useCallback, useMemo } from "react";

import { useCommunityTeams } from "@/src/api/read";
import {
  communityTeamPath,
  isRoutableCommunitySlug,
  normalizeCommunitySlug,
} from "@/src/domain/communities";
import { useAuthStore } from "@/src/stores";
import { useCommunityTeamCreate } from "./use-community-team-create";

export function useCommunityTeamsController(rawSlug?: string) {
  const slug = normalizeCommunitySlug(rawSlug ?? "");
  const isValidSlug = isRoutableCommunitySlug(slug);
  const router = useRouter();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const { data, isLoading, isError, error, refetch } = useCommunityTeams(
    isValidSlug ? slug : undefined,
    { viewer: walletAddress, enabled: isValidSlug },
  );
  const creation = useCommunityTeamCreate({ slug, walletAddress, refetch });

  const items = useMemo(
    () => (data?.items ?? []).filter((team) => !team.deleted),
    [data?.items],
  );
  const viewerTeamIds = useMemo(
    () => new Set((data?.viewer_team_ids ?? []).map(String)),
    [data?.viewer_team_ids],
  );

  const handleOpenTeam = useCallback((teamId: string) => {
    router.push(communityTeamPath(slug, teamId) as never);
  }, [router, slug]);

  return {
    slug,
    isValidSlug,
    items,
    viewerTeamIds,
    isLoading,
    isError,
    error,
    refetch,
    handleOpenTeam,
    creation,
    canCreate: isValidSlug && !!walletAddress,
  };
}
