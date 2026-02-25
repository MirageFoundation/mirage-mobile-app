import { useChainConfig } from "./use-parameters";
import type { AwardConfig } from "@/src/api/types";

export function useAwardConfigs(): {
  data: AwardConfig[] | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useChainConfig();
  return {
    data: data?.award_configs,
    isLoading,
  };
}
