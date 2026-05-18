import { useMutation } from "@tanstack/react-query";
import { useWallet } from "@/src/hooks/use-wallet";
import { useAuthStore } from "@/src/stores";
import { deleteUser } from "../endpoints/delete-user";
import { mutationKeys } from "../mutation-keys";
import type { PoWProgress } from "../signing";

export interface UseDeleteUserOptions {
  onPoWProgress?: (progress: PoWProgress) => void;
}

export function useDeleteUser(options: UseDeleteUserOptions = {}) {
  const { getWallet } = useWallet();
  const logout = useAuthStore((s) => s.logout);

  return useMutation({
    mutationKey: mutationKeys.user.delete(),
    mutationFn: async () => {
      const wallet = await getWallet();
      return deleteUser(wallet, { target: wallet.address }, options.onPoWProgress);
    },
    onSuccess: async () => {
      await logout();
    },
  });
}
