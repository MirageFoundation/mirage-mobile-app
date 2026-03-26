import { TransactionProgressModal } from "@/src/components/molecules";
import { useRouter } from "@/src/navigation/guarded-router";
import type { UseTransactionProgressReturn } from "@/src/hooks/use-transaction-progress";

interface UsernameTransactionModalProps {
  username: string;
  txProgress: UseTransactionProgressReturn;
  onDismissError: () => void | Promise<void>;
  onRetry: () => void;
}

export function UsernameTransactionModal({
  username,
  txProgress,
  onDismissError,
  onRetry,
}: UsernameTransactionModalProps) {
  const router = useRouter();

  return (
    <TransactionProgressModal
      visible={txProgress.isVisible}
      progress={txProgress.progress}
      title="Setting Up Account"
      description={`Registering @${username} on the blockchain`}
      onDismiss={
        txProgress.progress.phase === "success"
          ? () => {
              txProgress.hideModal();
              router.push({
                pathname: "/(auth)/recovery-phrase",
                params: { username: `anon-${username}` },
              });
            }
          : onDismissError
      }
      onRetry={onRetry}
      dismissible={
        txProgress.progress.phase === "success" ||
        txProgress.progress.phase === "error"
      }
    />
  );
}
