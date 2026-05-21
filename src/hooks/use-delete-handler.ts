/**
 * useDeleteHandler Hook
 *
 * Provides delete functionality with confirmation popup and POW queue integration.
 */

import { useCallback, useState } from "react";
import { useDelete } from "@/src/api/write";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export type DeleteTargetType = "post" | "comment";

export interface DeleteTarget {
  id: string;
  type: DeleteTargetType;
  rootPostId?: string;
}

export type DeleteRequestOptions = {
  rootPostId?: string;
};

export interface UseDeleteHandlerOptions {
  onSuccess?: (targetId: string, targetType: DeleteTargetType) => void;
  onError?: (targetId: string, targetType: DeleteTargetType, error: Error) => void;
  onRollback?: (targetId: string, targetType: DeleteTargetType) => void;
}

export interface UseDeleteHandlerReturn {
  requestDelete: (targetId: string, targetType: DeleteTargetType, options?: DeleteRequestOptions) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  isDeleting: boolean;
  showConfirmation: boolean;
  pendingTarget: DeleteTarget | null;
}

const getDeleteTargetKey = (targetId: string, targetType: DeleteTargetType) =>
  `${targetType}:${targetId}`;

export function useDeleteHandler(
  options: UseDeleteHandlerOptions = {}
): UseDeleteHandlerReturn {
  const { onSuccess, onError, onRollback } = options;

  const { requireAuth } = useAuthGuard();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<DeleteTarget | null>(null);
  const [deletingTargetKeys, setDeletingTargetKeys] = useState<Set<string>>(
    () => new Set()
  );

  const deleteMutation = useDelete();

  const isDeleting = pendingTarget
    ? deletingTargetKeys.has(getDeleteTargetKey(pendingTarget.id, pendingTarget.type))
    : false;

  const requestDelete = useCallback(
    (targetId: string, targetType: DeleteTargetType, requestOptions?: DeleteRequestOptions) => {
      requireAuth(() => {
        setPendingTarget({
          id: targetId,
          type: targetType,
          rootPostId: requestOptions?.rootPostId,
        });
        setShowConfirmation(true);
      });
    },
    [requireAuth]
  );

  const cancelDelete = useCallback(() => {
    setShowConfirmation(false);
    setPendingTarget(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!pendingTarget) return;

    const { id: targetId, type: targetType } = pendingTarget;
    const label = targetType === "post" ? "Deleting post" : "Deleting comment";
    const targetKey = getDeleteTargetKey(targetId, targetType);

    setShowConfirmation(false);
    setDeletingTargetKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      nextKeys.add(targetKey);
      return nextKeys;
    });

    const actionId = generateActionId();

    const clearDeletingTarget = () => {
      setDeletingTargetKeys((currentKeys) => {
        const nextKeys = new Set(currentKeys);
        nextKeys.delete(targetKey);
        return nextKeys;
      });
      setPendingTarget((currentTarget) => {
        if (
          currentTarget?.id === targetId &&
          currentTarget.type === targetType
        ) {
          return null;
        }

        return currentTarget;
      });
    };

    enqueue({
      id: actionId,
      type: "delete",
      label,
      execute: async () => {
        return deleteMutation.mutateAsync({ postId: targetId, rootPostId: pendingTarget.rootPostId });
      },
      onSuccess: () => {
        clearDeletingTarget();
        onSuccess?.(targetId, targetType);
      },
      onError: (error) => {
        clearDeletingTarget();
        onError?.(targetId, targetType, error);
      },
      onRollback: () => {
        clearDeletingTarget();
        onRollback?.(targetId, targetType);
      },
    });
  }, [pendingTarget, enqueue, deleteMutation, onSuccess, onError, onRollback]);

  return {
    requestDelete,
    confirmDelete,
    cancelDelete,
    isDeleting,
    showConfirmation,
    pendingTarget,
  };
}
