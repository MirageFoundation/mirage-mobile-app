import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setAgents } from "../endpoints/social";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";

export interface UseSetAgentsOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useSetAgents(options: UseSetAgentsOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.agents.set(),
    mutationFn: async (agents: string[]) => {
      const wallet = await getWallet();
      return setAgents(wallet, agents, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userFollowed(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.postsRoot() });
    },
  });
}
