import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/src/api/read/query-keys";
import { useWallet } from "@/src/hooks/use-wallet";
import {
  giftSubscription,
  type GiftSubscriptionInput,
} from "../endpoints/tokens";
import { mutationKeys } from "../mutation-keys";

export function useGiftSubscription() {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.tokens.giftSubscription(),
    mutationFn: async (input: GiftSubscriptionInput) => {
      const wallet = await getWallet();
      return giftSubscription(wallet, input);
    },
    onSuccess: (_data, { recipient }) => {
      if (address) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.userStatus(address),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.parameters(address),
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.userStatus(recipient),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profile(recipient),
      });
    },
  });
}
