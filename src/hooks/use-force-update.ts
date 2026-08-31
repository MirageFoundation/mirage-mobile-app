import {
  useForceUpdateContext,
  type ForceUpdateReason,
} from "@/src/providers/update-provider";

export type { ForceUpdateReason };

export function useForceUpdate() {
  return useForceUpdateContext();
}
