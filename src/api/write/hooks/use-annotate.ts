import { useWallet } from "@/src/hooks/use-wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { annotate, type AnnotateInput } from "../endpoints/annotate";
import type { PoWProgress } from "../signing";

export interface UseAnnotateOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useAnnotate(options: UseAnnotateOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet } = useWallet();

  return useMutation({
    mutationFn: async (input: AnnotateInput) => {
      const wallet = await getWallet();
      return annotate(wallet, input, options.onPoWProgress);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}
