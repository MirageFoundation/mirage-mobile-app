import {
  chunkModerationPostIds,
  groupEligibleModerationPosts,
  type CuratorMembership,
  type ModerationBatchGroup,
  type ModerationPostInput,
  type TeamModerationItem,
  type TeamModerationResponse,
} from "@/src/domain/communities";
import { getCommunityTeamModeration } from "../endpoints/curation";

export {
  chunkModerationPostIds,
  groupEligibleModerationPosts,
};

export type ModerationOverlayState = {
  post_hidden: boolean;
  user_hidden: boolean;
  thread_locked: boolean;
  post_tag: string | null;
};

export function moderationItemToOverlay(
  item: TeamModerationItem,
): ModerationOverlayState {
  return {
    post_hidden: item.post_hidden,
    user_hidden: item.user_hidden,
    thread_locked: item.thread_locked,
    post_tag: item.post_tag,
  };
}

export async function fetchModerationBatches(
  groups: readonly ModerationBatchGroup[],
  viewer: string,
  options?: { signal?: AbortSignal },
): Promise<{
  requests: number;
  itemsByPostId: Map<string, TeamModerationItem>;
  responses: TeamModerationResponse[];
}> {
  const itemsByPostId = new Map<string, TeamModerationItem>();
  const responses: TeamModerationResponse[] = [];
  let requests = 0;

  for (const group of groups) {
    const chunks = chunkModerationPostIds(group.post_ids);
    for (const postIds of chunks) {
      requests += 1;
      const response = await getCommunityTeamModeration(
        {
          slug: group.community,
          teamId: group.team_id,
          viewer,
          postIds,
        },
        options,
      );
      responses.push(response);
      for (const item of response.items ?? []) {
        itemsByPostId.set(item.post_id, item);
      }
    }
  }

  return { requests, itemsByPostId, responses };
}

export function collectEligibleModerationGroups(
  posts: readonly ModerationPostInput[],
  memberships: readonly CuratorMembership[],
): ModerationBatchGroup[] {
  return groupEligibleModerationPosts({ posts, memberships });
}
