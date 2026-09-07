import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAccountSnapshot } from "@/src/api/cache/account-status-cache";
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
        void invalidateAccountSnapshot(queryClient, address);
      }
      void invalidateAccountSnapshot(queryClient, recipient);
    },
  });
}
