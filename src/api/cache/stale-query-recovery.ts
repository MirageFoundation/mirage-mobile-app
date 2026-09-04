import type { Query, QueryClient } from "@tanstack/react-query";

import { normalizeAccountIdentity } from "@/src/api/read/query-keys";
import {
  normalizeServerBaseUrl,
  type ServerRequestContext,
} from "@/src/api/server-runtime";

export const STALE_QUERY_FOREGROUND_THRESHOLD_MS = 3 * 60 * 1000;
export const STALE_QUERY_RECOVERY_DEBOUNCE_MS = 5 * 1000;

export type RecoveryReason = "foreground" | "reconnect";

type RecoveryQuerySnapshot = {
  queryKey: readonly unknown[];
  isActive: boolean;
  isDisabled: boolean;
  isStale: boolean;
  fetchStatus: "fetching" | "paused" | "idle";
};

export type RecoveryQueryContext = {
  serverIdentity: string;
  viewerAddress?: string | null;
};

function hasCurrentViewer(
  queryKey: readonly unknown[],
  viewerIndex: number,
  viewerAddress: string,
): boolean {
  return queryKey[viewerIndex] === "viewer" &&
    queryKey[viewerIndex + 1] === viewerAddress;
}

export function isAllowlistedRecoveryQuery(
  queryKey: readonly unknown[],
  context: RecoveryQueryContext,
): boolean {
  if (
    queryKey[0] !== "server" ||
    queryKey[1] !== normalizeServerBaseUrl(context.serverIdentity)
  ) return false;

  const viewer = normalizeAccountIdentity(context.viewerAddress);
  const family = queryKey[2];

  if (family === "posts" || family === "comments") {
    return hasCurrentViewer(queryKey, 3, viewer);
  }

  if (family === "inbox") {
    return viewer !== "anonymous" && queryKey[3] === viewer;
  }

  if (family === "search") {
    return hasCurrentViewer(queryKey, 3, viewer);
  }

  if (family !== "user") return false;

  const userFamily = queryKey[3];
  if (
    userFamily === "status" ||
    userFamily === "profile" ||
    userFamily === "followed" ||
    userFamily === "blocked"
  ) {
    return viewer !== "anonymous" && queryKey[4] === viewer;
  }

  return userFamily === "posts" && hasCurrentViewer(queryKey, 5, viewer);
}

export function shouldRecoverQuery(
  query: RecoveryQuerySnapshot,
  context: RecoveryQueryContext,
): boolean {
  return query.isActive &&
    !query.isDisabled &&
    query.isStale &&
    query.fetchStatus === "idle" &&
    isAllowlistedRecoveryQuery(query.queryKey, context);
}

type RecoverStaleActiveQueriesOptions = {
  queryClient: QueryClient;
  getServerContext: () => ServerRequestContext;
  getViewerAddress: () => string | null | undefined;
};

export async function recoverStaleActiveQueries({
  queryClient,
  getServerContext,
  getViewerAddress,
}: RecoverStaleActiveQueriesOptions): Promise<void> {
  const serverContext = getServerContext();
  const context = {
    serverIdentity: serverContext.identity,
    viewerAddress: getViewerAddress(),
  };

  await queryClient.invalidateQueries({
    predicate: (query: Query) => {
      const currentServer = getServerContext();
      if (
        currentServer.generation !== serverContext.generation ||
        currentServer.identity !== serverContext.identity
      ) return false;

      return shouldRecoverQuery({
        queryKey: query.queryKey,
        isActive: query.isActive(),
        isDisabled: query.isDisabled(),
        isStale: query.isStale(),
        fetchStatus: query.state.fetchStatus,
      }, context);
    },
    refetchType: "active",
  }, {
    cancelRefetch: false,
  });
}

type StaleQueryRecoveryCoordinatorOptions = {
  onRecovery: (reason: RecoveryReason) => void;
  now?: () => number;
  foregroundThresholdMs?: number;
  debounceMs?: number;
};

export class StaleQueryRecoveryCoordinator {
  private readonly onRecovery: (reason: RecoveryReason) => void;
  private readonly now: () => number;
  private readonly foregroundThresholdMs: number;
  private readonly debounceMs: number;
  private appState: string | null = null;
  private connected: boolean | null = null;
  private backgroundedAt: number | null = null;
  private lastRecoveryAt = Number.NEGATIVE_INFINITY;

  constructor({
    onRecovery,
    now = Date.now,
    foregroundThresholdMs = STALE_QUERY_FOREGROUND_THRESHOLD_MS,
    debounceMs = STALE_QUERY_RECOVERY_DEBOUNCE_MS,
  }: StaleQueryRecoveryCoordinatorOptions) {
    this.onRecovery = onRecovery;
    this.now = now;
    this.foregroundThresholdMs = foregroundThresholdMs;
    this.debounceMs = debounceMs;
  }

  handleAppState(nextState: string): void {
    if (this.appState === null) {
      this.appState = nextState;
      if (nextState !== "active") this.backgroundedAt = this.now();
      return;
    }
    if (nextState === this.appState) return;

    const wasActive = this.appState === "active";
    this.appState = nextState;

    if (nextState !== "active") {
      if (wasActive) this.backgroundedAt = this.now();
      return;
    }

    const backgroundedAt = this.backgroundedAt;
    this.backgroundedAt = null;
    if (
      backgroundedAt !== null &&
      this.now() - backgroundedAt >= this.foregroundThresholdMs
    ) this.recover("foreground");
  }

  handleConnectivity(isConnected: boolean): void {
    if (this.connected === null) {
      this.connected = isConnected;
      return;
    }
    if (isConnected === this.connected) return;

    const wasConnected = this.connected;
    this.connected = isConnected;
    if (!wasConnected && isConnected) this.recover("reconnect");
  }

  private recover(reason: RecoveryReason): void {
    const now = this.now();
    if (now - this.lastRecoveryAt < this.debounceMs) return;
    this.lastRecoveryAt = now;
    this.onRecovery(reason);
  }
}
