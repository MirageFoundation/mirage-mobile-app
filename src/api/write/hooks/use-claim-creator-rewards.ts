import * as Sentry from "@sentry/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import type { CreatorClaimPhase } from "@/src/domain/creator-earnings";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";
import {
  claimCreatorRewardsSettled,
  type ClaimCreatorRewardsInput,
} from "../endpoints/creator-earnings";
import { applyCreatorClaimSettledEffects } from "../utils/creator-claim-settled-effects";
import { isExpectedCreatorClaimError } from "../utils/creator-claim-model";

export { applyCreatorClaimSettledEffects } from "../utils/creator-claim-settled-effects";

export interface UseClaimCreatorRewardsOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
  onPhase?: (phase: CreatorClaimPhase) => void;
}

export function useClaimCreatorRewards(options: UseClaimCreatorRewardsOptions = {}) {
  const queryClient = useQueryClient();
  const { getWallet, address } = useWallet();

  return useMutation({
    mutationKey: mutationKeys.creatorEarnings.claim(),
    mutationFn: async (input: ClaimCreatorRewardsInput) => {
      const wallet = await getWallet();
      return claimCreatorRewardsSettled(wallet, input, options.onPoWProgress, {
        onPhase: options.onPhase,
      });
    },
    onSuccess: (result) => {
      applyCreatorClaimSettledEffects(queryClient, result, address);
    },
    onError: (error: Error) => {
      if (isExpectedCreatorClaimError(error)) {
        Sentry.addBreadcrumb({
          category: "creator-earnings",
          message: "Expected creator claim failure",
          level: "info",
          data: { message: error.message },
        });
        return;
      }
      Sentry.captureException(error, {
        tags: { feature: "creator-earnings", operation: "claim" },
      });
    },
  });
}
