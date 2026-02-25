import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { queryKeys } from "@/src/api/read/query-keys";
import { giveAward, type GiveAwardInput } from "../endpoints/award";

export function useGiveAward() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationFn: async (input: GiveAwardInput) => {
      const wallet = await getWallet();
      return giveAward(wallet, input);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["posts"] });
      await queryClient.cancelQueries({ queryKey: ["comments"] });

      const previousPosts = queryClient.getQueriesData({ queryKey: ["posts"] });
      const previousComments = queryClient.getQueriesData({ queryKey: ["comments"] });

      return { previousPosts, previousComments };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousPosts) {
        for (const [key, data] of context.previousPosts) {
          queryClient.setQueryData(key, data);
        }
      }
      if (context?.previousComments) {
        for (const [key, data] of context.previousComments) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["posts"],
        refetchType: "none",
      });
      queryClient.invalidateQueries({
        queryKey: ["comments"],
        refetchType: "none",
      });
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
          refetchType: "none",
        });
      }
    },
  });
}
