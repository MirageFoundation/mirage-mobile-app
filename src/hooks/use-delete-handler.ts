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
  getActionLabel,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export type DeleteTargetType = "post" | "comment";

export interface DeleteTarget {
  id: string;
  type: DeleteTargetType;
}

export interface UseDeleteHandlerOptions {
  onSuccess?: (targetId: string, targetType: DeleteTargetType) => void;
  onError?: (targetId: string, targetType: DeleteTargetType, error: Error) => void;
  onRollback?: (targetId: string, targetType: DeleteTargetType) => void;
}

export interface UseDeleteHandlerReturn {
  requestDelete: (targetId: string, targetType: DeleteTargetType) => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  isDeleting: boolean;
  showConfirmation: boolean;
  pendingTarget: DeleteTarget | null;
}

export function useDeleteHandler(
  options: UseDeleteHandlerOptions = {}
): UseDeleteHandlerReturn {
  const { onSuccess, onError } = options;

  const { requireAuth } = useAuthGuard();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMutation = useDelete();

  const requestDelete = useCallback(
    (targetId: string, targetType: DeleteTargetType) => {
      requireAuth(() => {
        setPendingTarget({ id: targetId, type: targetType });
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

    setShowConfirmation(false);
    setIsDeleting(true);

    const actionId = generateActionId();

    enqueue({
      id: actionId,
      type: "delete",
      label,
      execute: async () => {
        return deleteMutation.mutateAsync({ postId: targetId });
      },
      onSuccess: () => {
        setIsDeleting(false);
        setPendingTarget(null);
        onSuccess?.(targetId, targetType);
      },
      onError: (error) => {
        setIsDeleting(false);
        setPendingTarget(null);
        onError?.(targetId, targetType, error);
      },
      onRollback: () => {
        setIsDeleting(false);
        setPendingTarget(null);
        options.onRollback?.(targetId, targetType);
      },
    });
  }, [pendingTarget, enqueue, deleteMutation, onSuccess, onError, options.onRollback]);

  return {
    requestDelete,
    confirmDelete,
    cancelDelete,
    isDeleting,
    showConfirmation,
    pendingTarget,
  };
}
