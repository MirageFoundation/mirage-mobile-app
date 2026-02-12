import { useCallback, useEffect, useRef } from "react";
import {
 useToggleFollowUser,
 useToggleFollowTopic,
} from "@/src/api/write";
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
 onOptimisticFollowTopic?: (topic: string, isFollowing: boolean) => void;
 onRollbackFollowTopic?: (topic: string) => void;
}

export interface UseFollowHandlerReturn {
 handleFollowUser: (
  userId: string,
  username: string,
  isCurrentlyFollowing: boolean,
 ) => void;
 handleFollowTopic: (
  topic: string,
  isCurrentlyFollowing: boolean,
 ) => void;
}

export function useFollowHandler(
 options: UseFollowHandlerOptions = {},
): UseFollowHandlerReturn {
 const {
  onOptimisticFollowUser,
  onRollbackFollowUser,
  onOptimisticFollowTopic,
  onRollbackFollowTopic,
 } = options;

 const { requireAuth } = useAuthGuard();
 const enqueue = usePowQueueStore((state) => state.enqueue);

 const toggleFollowUserMutation = useToggleFollowUser();
 const toggleFollowTopicMutation = useToggleFollowTopic();
 const followUserAsyncRef = useRef(toggleFollowUserMutation.mutateAsync);
 const followTopicAsyncRef = useRef(toggleFollowTopicMutation.mutateAsync);

 useEffect(() => {
  followUserAsyncRef.current = toggleFollowUserMutation.mutateAsync;
 }, [toggleFollowUserMutation.mutateAsync]);

 useEffect(() => {
  followTopicAsyncRef.current = toggleFollowTopicMutation.mutateAsync;
 }, [toggleFollowTopicMutation.mutateAsync]);

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
      return followUserAsyncRef.current({
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
  [requireAuth, enqueue, onOptimisticFollowUser, onRollbackFollowUser],
 );

 const handleFollowTopic = useCallback(
  (topic: string, isCurrentlyFollowing: boolean) => {
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
      return followTopicAsyncRef.current({
       topic,
       isCurrentlyFollowing,
      });
     },
     onOptimisticUpdate: () => {
      onOptimisticFollowTopic?.(topic, !isCurrentlyFollowing);
     },
     onSuccess: () => {},
     onError: () => {},
     onRollback: () => {
      onRollbackFollowTopic?.(topic);
     },
    });
   });
  },
  [requireAuth, enqueue, onOptimisticFollowTopic, onRollbackFollowTopic],
 );

 return {
  handleFollowUser,
  handleFollowTopic,
 };
}
