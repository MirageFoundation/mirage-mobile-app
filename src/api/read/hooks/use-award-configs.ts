import { useChainConfig } from "./use-parameters";
import type { AwardConfig } from "@/src/api/types";

export function useAwardConfigs(options?: { enabled?: boolean }): {
  data: AwardConfig[] | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useChainConfig(options);
  return {
    data: data?.award_configs,
    isLoading,
  };
}
