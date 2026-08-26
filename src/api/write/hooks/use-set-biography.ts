import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setBiography } from "../endpoints/biography";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";

export interface UseSetBiographyOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useSetBiography(options: UseSetBiographyOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.biography.set(),
    mutationFn: async (biography: string) => {
      const wallet = await getWallet();
      return setBiography(wallet, biography, options.onPoWProgress);
    },
    onSuccess: () => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.profile(address),
        });
      }
    },
  });
}
