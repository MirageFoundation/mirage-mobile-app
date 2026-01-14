/**
 * useReportHandler Hook
 *
 * Provides report functionality with reason selection sheet and toast notifications.
 * Handles reporting posts and comments.
 */

import { useCallback, useRef, useState } from "react";
import { useReport } from "@/src/api/write";
import type { PoWProgress } from "@/src/api/write";
import { useToast } from "@/src/providers/toast-provider";
import { useAuthGuard } from "./use-auth-guard";

// ============================================
// Types
// ============================================

export type ReportTargetType = "post" | "comment";

export interface ReportTarget {
  id: string;
  type: ReportTargetType;
}

export interface UseReportHandlerOptions {
  /** Called when report succeeds */
  onSuccess?: (targetId: string, targetType: ReportTargetType) => void;
  /** Called when report fails */
  onError?: (targetId: string, error: Error) => void;
}

export interface UseReportHandlerReturn {
  /** Request reporting content (shows report sheet) */
  requestReport: (targetId: string, targetType: ReportTargetType) => void;
  /** Submit the report with a reason */
  submitReport: (reason: string) => void;
  /** Cancel the report */
  cancelReport: () => void;
  /** Whether a report is in progress */
  isReporting: boolean;
  /** Whether the report sheet should be shown */
  showReportSheet: boolean;
  /** The pending report target (if any) */
  pendingTarget: ReportTarget | null;
}

// ============================================
// Hook
// ============================================

export function useReportHandler(
  options: UseReportHandlerOptions = {}
): UseReportHandlerReturn {
  const { onSuccess, onError } = options;

  const toast = useToast();
  const { requireAuth } = useAuthGuard();

  // State for report sheet
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ReportTarget | null>(null);
  const [isReporting, setIsReporting] = useState(false);

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

  // Create report mutation
  const reportMutation = useReport({
    onPoWProgress: handlePoWProgress,
  });

  // Request reporting content (shows report sheet)
  const requestReport = useCallback(
    (targetId: string, targetType: ReportTargetType) => {
      requireAuth(() => {
        setPendingTarget({ id: targetId, type: targetType });
        setShowReportSheet(true);
      });
    },
    [requireAuth]
  );

  // Cancel report
  const cancelReport = useCallback(() => {
    setShowReportSheet(false);
    setPendingTarget(null);
  }, []);

  // Submit report with reason
  const submitReport = useCallback(
    async (reason: string) => {
      if (!pendingTarget) return;

      const { id: targetId, type: targetType } = pendingTarget;
      const label = targetType === "post" ? "Post" : "Comment";

      setShowReportSheet(false);
      setIsReporting(true);

      // Show loading toast
      const toastId = toast.loading(
        `Reporting ${label.toLowerCase()}...`,
        "Computing proof of work..."
      );
      toastIdRef.current = toastId;

      try {
        await reportMutation.mutateAsync({
          target: targetId,
          reason: reason,
        });

        // Success
        toast.update(toastId, {
          type: "success",
          title: "Report submitted",
          description: "Thanks for helping keep Mirage safe",
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
          title: "Failed to submit report",
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
        setIsReporting(false);
        setPendingTarget(null);
        toastIdRef.current = null;
      }
    },
    [pendingTarget, toast, reportMutation, onSuccess, onError]
  );

  return {
    requestReport,
    submitReport,
    cancelReport,
    isReporting,
    showReportSheet,
    pendingTarget,
  };
}
