import { useQuery } from "@tanstack/react-query";
import { usePreferencesStore, type ApiServer } from "@/src/stores";
import { useMemo, useRef } from "react";
import type { PeersResponse } from "@/src/api/types";
import axios from "axios";

const DEFAULT_SERVERS: ApiServer[] = ["mirage.talk", "mirage.vote"];
const PEERS_SOURCE = "https://mirage.talk";

function extractDomain(moniker: string): string | null {
  try {
    const url = moniker.startsWith("http") ? moniker : `https://${moniker}`;
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchPeersFromSource(): Promise<PeersResponse> {
  const { data } = await axios.get<PeersResponse>(`${PEERS_SOURCE}/get_peers`);
  return data;
}

export function useServerList() {
  const currentServer = usePreferencesStore((s) => s.apiServer);
  const lastServersRef = useRef<ApiServer[]>(DEFAULT_SERVERS);

  const { data: peersData, isLoading } = useQuery({
    queryKey: ["peers", "source"],
    queryFn: fetchPeersFromSource,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  const servers = useMemo(() => {
    console.log("[useServerList] peersData:", JSON.stringify(peersData));
    if (!peersData?.peers?.length) {
      const current = lastServersRef.current;
      console.log("[useServerList] No peers, using fallback:", current);
      if (current.includes(currentServer)) return current;
      return [...new Set([currentServer, ...current])];
    }

    const peerDomains = peersData.peers
      .map((p) => extractDomain(p.moniker))
      .filter((d): d is string => d !== null);
    console.log("[useServerList] peerDomains:", peerDomains);

    const allServers = Array.from(new Set<string>([currentServer, ...peerDomains]));
    console.log("[useServerList] final servers:", allServers);
    lastServersRef.current = allServers;
    return allServers;
  }, [peersData, currentServer]);

  return { servers, isLoading };
}
