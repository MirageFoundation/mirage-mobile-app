/**
 * useDeleteHandler Hook
 *
 * Provides delete functionality with confirmation popup and toast notifications.
 * Shows confirmation before deleting, then handles API call with PoW progress.
 */

import { useCallback, useRef, useState } from "react";
import { useDelete } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
import { useAuthGuard } from "./use-auth-guard";

// ============================================
// Types
// ============================================

export type DeleteTargetType = "post" | "comment";

export interface DeleteTarget {
  id: string;
  type: DeleteTargetType;
}

export interface UseDeleteHandlerOptions {
  /** Called when delete succeeds */
  onSuccess?: (targetId: string, targetType: DeleteTargetType) => void;
  /** Called when delete fails */
  onError?: (targetId: string, error: Error) => void;
}

export interface UseDeleteHandlerReturn {
  /** Request deletion (shows confirmation popup) */
  requestDelete: (targetId: string, targetType: DeleteTargetType) => void;
  /** Confirm the pending deletion */
  confirmDelete: () => void;
  /** Cancel the pending deletion */
  cancelDelete: () => void;
  /** Whether a delete is in progress */
  isDeleting: boolean;
  /** Whether the confirmation popup should be shown */
  showConfirmation: boolean;
  /** The pending delete target (if any) */
  pendingTarget: DeleteTarget | null;
}

// ============================================
// Hook
// ============================================

export function useDeleteHandler(
  options: UseDeleteHandlerOptions = {}
): UseDeleteHandlerReturn {
  const { onSuccess, onError } = options;

  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  // State for confirmation popup
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Track current toast ID
  const toastIdRef = useRef<string | null>(null);

  // PoW progress handler
  const handlePoWProgress = useCallback(
    (progress: PoWProgress) => {
      if (toastIdRef.current) {
        const progressPercent =
          progress.estimatedTotalMs > 0
            ? Math.min(
                99,
                Math.round((progress.elapsedMs / progress.estimatedTotalMs) * 100)
              )
            : 0;
        toast.update(toastIdRef.current, {
          description: `Computing proof of work... ${progressPercent}%`,
        });
      }
    },
    [toast]
  );

  // Create delete mutation
  const deleteMutation = useDelete({
    onPoWProgress: handlePoWProgress,
  });

  // Request deletion (shows confirmation)
  const requestDelete = useCallback(
    (targetId: string, targetType: DeleteTargetType) => {
      requireAuth(() => {
        setPendingTarget({ id: targetId, type: targetType });
        setShowConfirmation(true);
      });
    },
    [requireAuth]
  );

  // Cancel deletion
  const cancelDelete = useCallback(() => {
    setShowConfirmation(false);
    setPendingTarget(null);
  }, []);

  // Confirm and execute deletion
  const confirmDelete = useCallback(async () => {
    if (!pendingTarget) return;

    const { id: targetId, type: targetType } = pendingTarget;
    const label = targetType === "post" ? "Post" : "Comment";

    setShowConfirmation(false);
    setIsDeleting(true);

    // Show loading toast
    const toastId = toast.loading(
      `Deleting ${label.toLowerCase()}...`,
      "Computing proof of work..."
    );
    toastIdRef.current = toastId;

    try {
      await deleteMutation.mutateAsync({ postId: targetId });

      // Success
      toast.update(toastId, {
        type: "success",
        title: `${label} deleted`,
        description: undefined,
        duration: 3000,
      });
      setTimeout(() => toast.dismiss(toastId), 3000);

      onSuccess?.(targetId, targetType);
    } catch (error) {
      // Error
      const errorMessage =
        error instanceof Error ? error.message : "Please try again";

      toast.update(toastId, {
        type: "error",
        title: `Failed to delete ${label.toLowerCase()}`,
        description: errorMessage,
        duration: 4000,
      });
      setTimeout(() => toast.dismiss(toastId), 4000);

      if (error instanceof Error) {
        onError?.(targetId, error);
      } else {
        onError?.(targetId, new Error(String(error)));
      }
    } finally {
      setIsDeleting(false);
      setPendingTarget(null);
      toastIdRef.current = null;
    }
  }, [pendingTarget, toast, deleteMutation, onSuccess, onError]);

  return {
    requestDelete,
    confirmDelete,
    cancelDelete,
    isDeleting,
    showConfirmation,
    pendingTarget,
  };
}
