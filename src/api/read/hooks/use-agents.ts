import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getAgents } from "../endpoints/agents";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents(),
    queryFn: () => getAgents(),
    staleTime: 60_000,
  });
}
