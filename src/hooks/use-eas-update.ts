import {
  useEasUpdateContext,
  type EasUpdateStatus,
} from "@/src/providers/update-provider";

export type { EasUpdateStatus };

export function useEasUpdate() {
  return useEasUpdateContext();
}
