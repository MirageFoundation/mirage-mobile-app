import { useQuery } from "@tanstack/react-query";
import { usePreferencesStore, type ApiServer } from "@/src/stores";
import { useMemo, useRef } from "react";
import type { PeersResponse } from "@/src/api/types";
import axios from "axios";
import * as Sentry from "@sentry/react-native";

const OFFICIAL_SERVERS: ApiServer[] = [
  "https://mirage.talk",
  "https://mirage.vote",
];
const PEERS_SOURCE = "https://mirage.talk";
const PEERS_API_PATH = "/api/get_peers";
const HEALTH_CHECK_PATH = "/api/get_node_config";
const PEER_HEALTH_TIMEOUT_MS = 5000;

async function fetchPeersFromSource(): Promise<PeersResponse> {
  const { data } = await axios.get<PeersResponse>(
    `${PEERS_SOURCE}${PEERS_API_PATH}`,
    { timeout: 8000 }
  );
  return data;
}

async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const res = await axios.get(`${url}${HEALTH_CHECK_PATH}`, {
      timeout: PEER_HEALTH_TIMEOUT_MS,
      validateStatus: (status) => status >= 200 && status < 300,
      maxRedirects: 0,
    });
    return !!res.data && typeof res.data === "object";
  } catch (error) {
    Sentry.addBreadcrumb({
      category: "server-list",
      message: "Peer health check failed",
      level: "info",
      data: {
        url,
        status: (error as any)?.response?.status,
        code: (error as any)?.code,
      },
    });
    return false;
  }
}

async function fetchHealthyServers(): Promise<ApiServer[]> {
  let peerUrls: string[] = [];
  try {
    const peers = await fetchPeersFromSource();
    peerUrls = (peers.peers ?? [])
      .map((p) => p?.ip)
      .filter((ip): ip is string => !!ip && typeof ip === "string")
      .map((ip) => `http://${ip}`);
    Sentry.addBreadcrumb({
      category: "server-list",
      message: "Fetched peers from source",
      level: "info",
      data: { source: PEERS_SOURCE, peerCount: peerUrls.length },
    });
  } catch (error) {
    peerUrls = [];
    Sentry.addBreadcrumb({
      category: "server-list",
      message: "Failed to fetch peers from source",
      level: "warning",
      data: { source: PEERS_SOURCE, error: (error as any)?.message },
    });
    Sentry.captureException(error, {
      tags: { feature: "server-list", operation: "fetch-peers" },
      extra: { source: PEERS_SOURCE },
    });
  }

  const candidates = Array.from(new Set<string>([...OFFICIAL_SERVERS, ...peerUrls]));

  const results = await Promise.all(
    candidates.map(async (url) => ({
      url,
      ok: OFFICIAL_SERVERS.includes(url) ? true : await checkServerHealth(url),
    }))
  );

  const healthy = results.filter((r) => r.ok).map((r) => r.url);
  Sentry.addBreadcrumb({
    category: "server-list",
    message: "Computed healthy server list",
    level: "info",
    data: {
      candidates: candidates.length,
      healthy: healthy.length,
      filtered: candidates.length - healthy.length,
    },
  });
  return healthy;
}

export function useServerList() {
  const currentServer = usePreferencesStore((s) => s.apiServer);
  const lastServersRef = useRef<ApiServer[]>(OFFICIAL_SERVERS);

  const { data: healthyServers, isLoading } = useQuery({
    queryKey: ["server-list", "healthy"],
    queryFn: fetchHealthyServers,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  });

  const servers = useMemo(() => {
    if (!healthyServers || healthyServers.length === 0) {
      const current = lastServersRef.current;
      if (current.includes(currentServer)) return current;
      return Array.from(new Set<string>([currentServer, ...current]));
    }

    const merged = Array.from(
      new Set<string>([currentServer, ...healthyServers])
    );
    lastServersRef.current = merged;
    return merged;
  }, [healthyServers, currentServer]);

  return { servers, isLoading };
}
