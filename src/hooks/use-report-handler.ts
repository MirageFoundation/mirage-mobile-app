/**
 * useReportHandler Hook
 *
 * Provides report functionality with reason selection sheet and POW queue integration.
 */

import { useCallback, useState } from "react";
import { useReport } from "@/src/api/write";
import {
  usePowQueueStore,
  generateActionId,
} from "@/src/services/pow-queue";
import { useAuthGuard } from "./use-auth-guard";

export type ReportTargetType = "post" | "comment";

export interface ReportTarget {
  id: string;
  type: ReportTargetType;
}

export interface UseReportHandlerOptions {
  onSuccess?: (targetId: string, targetType: ReportTargetType) => void;
  onError?: (targetId: string, error: Error) => void;
}

export interface UseReportHandlerReturn {
  requestReport: (targetId: string, targetType: ReportTargetType) => void;
  submitReport: (reason: string) => void;
  cancelReport: () => void;
  isReporting: boolean;
  showReportSheet: boolean;
  pendingTarget: ReportTarget | null;
}

export function useReportHandler(
  options: UseReportHandlerOptions = {}
): UseReportHandlerReturn {
  const { onSuccess, onError } = options;

  const { requireAuth } = useAuthGuard();
  const enqueue = usePowQueueStore((state) => state.enqueue);

  const [showReportSheet, setShowReportSheet] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<ReportTarget | null>(null);
  const [isReporting, setIsReporting] = useState(false);

  const reportMutation = useReport();

  const requestReport = useCallback(
    (targetId: string, targetType: ReportTargetType) => {
      requireAuth(() => {
        setPendingTarget({ id: targetId, type: targetType });
        setShowReportSheet(true);
      });
    },
    [requireAuth]
  );

  const cancelReport = useCallback(() => {
    setShowReportSheet(false);
    setPendingTarget(null);
  }, []);

  const submitReport = useCallback(
    (reason: string) => {
      if (!pendingTarget) return;

      const { id: targetId, type: targetType } = pendingTarget;
      const label = targetType === "post" ? "Reporting post" : "Reporting comment";

      setShowReportSheet(false);
      setIsReporting(true);

      const actionId = generateActionId();

      enqueue({
        id: actionId,
        type: "report",
        label,
        execute: async () => {
          return reportMutation.mutateAsync({
            target: targetId,
            reason: reason,
          });
        },
        onSuccess: () => {
          setIsReporting(false);
          setPendingTarget(null);
          onSuccess?.(targetId, targetType);
        },
        onError: (error) => {
          setIsReporting(false);
          setPendingTarget(null);
          onError?.(targetId, error);
        },
        onRollback: () => {
          setIsReporting(false);
          setPendingTarget(null);
        },
      });
    },
    [pendingTarget, enqueue, reportMutation, onSuccess, onError]
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
