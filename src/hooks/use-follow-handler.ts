import { useCallback } from "react";
import {
 useToggleFollowUser,
 useToggleCommunityMembership,
} from "@/src/api/write";
import type { PersistedLensChoice } from "@/src/api/write/utils/community-membership-model";
import {
 usePowQueueStore,
 generateActionId,
 getActionLabel,
 type PowActionType,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export interface UseFollowHandlerOptions {
 onOptimisticFollowUser?: (userId: string, isFollowing: boolean) => void;
 onRollbackFollowUser?: (userId: string) => void;
 onOptimisticJoinCommunity?: (community: string, isJoined: boolean) => void;
 onRollbackJoinCommunity?: (community: string) => void;
}

export interface UseFollowHandlerReturn {
 handleFollowUser: (
  userId: string,
  username: string,
  isCurrentlyFollowing: boolean,
 ) => void;
 handleToggleCommunityMembership: (
  community: string,
  isCurrentlyJoined: boolean,
  selection?: PersistedLensChoice,
 ) => void;
}

export function useFollowHandler(
 options: UseFollowHandlerOptions = {},
): UseFollowHandlerReturn {
 const {
  onOptimisticFollowUser,
  onRollbackFollowUser,
  onOptimisticJoinCommunity,
  onRollbackJoinCommunity,
 } = options;

 const { requireAuth } = useAuthGuard();
 const enqueue = usePowQueueStore((state) => state.enqueue);

 const { mutateAsync: toggleFollowUserAsync } = useToggleFollowUser();
 const { mutateAsync: toggleCommunityMembershipAsync } = useToggleCommunityMembership();

 const handleFollowUser = useCallback(
  (
   userId: string,
   username: string,
   isCurrentlyFollowing: boolean,
  ) => {
   requireAuth(() => {
    const actionType: PowActionType = isCurrentlyFollowing
     ? "unfollow"
     : "follow";
    const actionId = generateActionId();

    enqueue({
     id: actionId,
     type: actionType,
     label: getActionLabel(actionType),
     execute: async () => {
      return toggleFollowUserAsync({
       userAddress: userId,
       isCurrentlyFollowing,
      });
     },
     onOptimisticUpdate: () => {
      onOptimisticFollowUser?.(userId, !isCurrentlyFollowing);
     },
     onSuccess: () => {},
     onError: () => {},
     onRollback: () => {
      onRollbackFollowUser?.(userId);
     },
    });
   });
  },
  [
   requireAuth,
   enqueue,
   onOptimisticFollowUser,
   onRollbackFollowUser,
   toggleFollowUserAsync,
  ],
 );

 const handleToggleCommunityMembership = useCallback(
  (
   community: string,
   isCurrentlyJoined: boolean,
   selection?: PersistedLensChoice,
  ) => {
   requireAuth(() => {
    const actionType: PowActionType = isCurrentlyJoined
     ? "unfollow"
     : "follow";
    const actionId = generateActionId();

    enqueue({
     id: actionId,
     type: actionType,
     label: getActionLabel(actionType),
     execute: async () => {
      return toggleCommunityMembershipAsync({
       community,
       isCurrentlyJoined,
       selection: isCurrentlyJoined ? undefined : selection,
      });
     },
     onOptimisticUpdate: () => {
      onOptimisticJoinCommunity?.(community, !isCurrentlyJoined);
     },
     onSuccess: () => {},
     onError: () => {},
     onRollback: () => {
      onRollbackJoinCommunity?.(community);
     },
    });
   });
  },
  [
   requireAuth,
   enqueue,
   onOptimisticJoinCommunity,
   onRollbackJoinCommunity,
   toggleCommunityMembershipAsync,
  ],
 );

 return {
  handleFollowUser,
  handleToggleCommunityMembership,
 };
}
