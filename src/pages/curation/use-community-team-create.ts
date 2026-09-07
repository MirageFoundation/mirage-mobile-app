import { useRef, useState } from "react";

import { useCreateCurationTeam } from "@/src/api/write";
import { useCheckCreatedTeam } from "@/src/api/write/hooks/use-check-created-team";
import type { SettledCurationWriteResult } from "@/src/api/write/utils/curation-model";
import type { CommunityTeamsResponse } from "@/src/domain/communities";
import { useToast } from "@/src/providers/toast-provider";
import { parseApiError } from "@/src/utils/parse-api-error";

export function useCommunityTeamCreate({
  slug,
  walletAddress,
  refetch,
}: {
  slug: string;
  walletAddress: string | null;
  refetch: () => Promise<{ data?: CommunityTeamsResponse; isError: boolean }>;
}) {
  const createTeam = useCreateCurationTeam();
  const checkCreatedTeam = useCheckCreatedTeam(refetch);
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const delivered = useRef<SettledCurationWriteResult | null>(null);

  function confirmCreated() {
    delivered.current = null;
    busy.current = false;
    setSyncing(false);
    setName("");
    setDescription("");
    setVisible(false);
    toast.success("Team created");
  }

  function handleCreate(input: { name: string; description: string }) {
    if (busy.current || delivered.current || !input.name.trim()) return;
    busy.current = true;
    createTeam.mutate(
      { community: slug, name: input.name.trim(), description: input.description },
      {
        onSuccess: (result) => {
          if (result.settlement.status === "settled") {
            confirmCreated();
            return;
          }
          delivered.current = result;
          busy.current = false;
          setSyncing(true);
          toast.info("Team still syncing");
        },
        onError: (err) => {
          busy.current = false;
          const error = parseApiError(err);
          toast.error(error.errorCode === "not_subscriber" ? error.message : "Team creation failed");
        },
      },
    );
  }

  async function checkStatus() {
    const result = delivered.current;
    if (!result || busy.current || !walletAddress) return;
    busy.current = true;
    setChecking(true);
    try {
      if (await checkCreatedTeam(result, walletAddress)) {
        confirmCreated();
      } else {
        toast.info("Team still syncing");
      }
    } catch {
      toast.error("Sync check failed");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  return {
    visible,
    name,
    description,
    syncing,
    checking,
    pending: createTeam.isPending || checking,
    setName,
    setDescription,
    open: () => setVisible(true),
    close: () => { if (!busy.current) setVisible(false); },
    handleCreate,
    checkStatus,
  };
}
