import { normalizeServerBaseUrl } from "@/src/api/server-runtime";
import { normalizeAccountIdentity } from "@/src/api/read/query-keys";

type UnknownRecord = Record<string, unknown>;

export const PERSISTED_QUERY_SCHEMA_VERSION = 3;
export const PERSISTED_QUERY_MAX_PAGES = 1;
export const PERSISTED_QUERY_MAX_BYTES = 1024 * 1024;
export const PERSISTED_QUERY_BUSTER = "launch-feed-cache-v3";
export const PERSISTED_QUERY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistedQueryMetrics = {
  queryCount: number;
  pageCount: number;
  bytes: number;
  durationMs: number;
};

export type PreparedPersistedClient = {
  client: unknown;
  serialized: string;
  metrics: PersistedQueryMetrics;
};

export type HydratablePersistedQueryClient = {
  timestamp: number;
  buster: string;
  clientState: unknown;
};

type PersistedEnvelope = {
  schemaVersion: number;
  namespace: string;
  client: unknown;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isDeviceLocalUri = (value: unknown): boolean =>
  typeof value === "string" &&
  /^(file|content|ph|assets-library|blob):/i.test(value);

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

export function buildPersistedQueryNamespace(
  serverIdentity: string,
  viewerAddress?: string | null,
): string {
  return [
    `v${PERSISTED_QUERY_SCHEMA_VERSION}`,
    normalizeServerBaseUrl(serverIdentity),
    normalizeAccountIdentity(viewerAddress),
  ].join("|");
}

export function buildPersistedQueryStorageKey(namespace: string): string {
  return `mirage-query-cache:${encodeURIComponent(namespace)}`;
}

export function getHydratablePersistedQueryClient(
  client: unknown,
  {
    buster = PERSISTED_QUERY_BUSTER,
    maxAgeMs = PERSISTED_QUERY_MAX_AGE_MS,
    now = Date.now(),
  }: {
    buster?: string;
    maxAgeMs?: number;
    now?: number;
  } = {},
): HydratablePersistedQueryClient | null {
  if (!isRecord(client) || !isRecord(client.clientState)) return null;
  const timestamp = Number(client.timestamp);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    client.buster !== buster ||
    now - timestamp > maxAgeMs ||
    timestamp > now + 60_000
  ) {
    return null;
  }
  return {
    timestamp,
    buster,
    clientState: client.clientState,
  };
}

export function isLaunchCriticalFeedQuery(queryKey: unknown): boolean {
  if (!Array.isArray(queryKey)) return false;
  if (
    queryKey[0] !== "server" ||
    typeof queryKey[1] !== "string" ||
    queryKey[2] !== "posts" ||
    queryKey[3] !== "viewer" ||
    typeof queryKey[4] !== "string"
  ) {
    return false;
  }

  const filters = queryKey[5];
  return (
    isRecord(filters) &&
    (filters.feed === "home" || filters.feed === "following") &&
    filters.by === "magic" &&
    (filters.page === undefined || filters.page === null)
  );
}

export function isPersistedRewardSummaryQuery(queryKey: unknown): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === "server" &&
    typeof queryKey[1] === "string" &&
    queryKey[2] === "rewards" &&
    queryKey[3] === "summary" &&
    typeof queryKey[4] === "string"
  );
}

export function isLaunchPersistedQuery(queryKey: unknown): boolean {
  return (
    isLaunchCriticalFeedQuery(queryKey) ||
    isPersistedRewardSummaryQuery(queryKey)
  );
}

function isSafeServerPost(value: unknown): value is UnknownRecord {
  if (!isRecord(value)) return false;
  if (
    typeof value.post_id !== "string" ||
    value.post_id.length === 0 ||
    typeof value.user_id !== "string" ||
    value.user_id.length === 0 ||
    typeof value.username !== "string" ||
    typeof value.timestamp !== "number"
  ) {
    return false;
  }
  if (
    value.post_id.startsWith("optimistic-post-") ||
    value.post_id.startsWith("local-") ||
    Object.keys(value).some((key) =>
      key.startsWith("optimistic_") && value[key] !== undefined,
    )
  ) {
    return false;
  }
  if (
    value.media !== undefined &&
    (!Array.isArray(value.media) ||
      !value.media.every(
        (uri) => typeof uri === "string" && !isDeviceLocalUri(uri),
      ))
  ) {
    return false;
  }
  return !isDeviceLocalUri(value.thumbnail);
}

function sanitizePostsResponse(value: unknown): UnknownRecord | undefined {
  if (!isRecord(value) || !Array.isArray(value.posts)) return undefined;
  const posts = value.posts.filter(isSafeServerPost);
  return posts.length === value.posts.length ? value : { ...value, posts };
}

export function sanitizePersistedPostsData(data: unknown): unknown | undefined {
  if (!isRecord(data) || !Array.isArray(data.pages)) return undefined;

  const pages = data.pages
    .slice(0, PERSISTED_QUERY_MAX_PAGES)
    .map(sanitizePostsResponse);
  if (pages.length === 0 || pages.some((page) => page === undefined)) {
    return undefined;
  }

  return {
    ...data,
    pages,
    pageParams: Array.isArray(data.pageParams)
      ? data.pageParams.slice(0, PERSISTED_QUERY_MAX_PAGES)
      : [],
  };
}

function sanitizePersistedRewardSummaryData(data: unknown): unknown | undefined {
  if (
    !isRecord(data) ||
    !Array.isArray(data.daily_quests) ||
    !Array.isArray(data.pending_rewards)
  ) {
    return undefined;
  }
  return data;
}

function sanitizeAllowedQuery(
  query: unknown,
  namespace: string,
): UnknownRecord | undefined {
  if (
    !isRecord(query) ||
    !Array.isArray(query.queryKey) ||
    !isLaunchPersistedQuery(query.queryKey) ||
    !isRecord(query.state) ||
    query.state.status !== "success"
  ) {
    return undefined;
  }
  if (
    buildPersistedQueryNamespace(query.queryKey[1], query.queryKey[4]) !==
    namespace
  ) {
    return undefined;
  }

  const data = isLaunchCriticalFeedQuery(query.queryKey)
    ? sanitizePersistedPostsData(query.state.data)
    : sanitizePersistedRewardSummaryData(query.state.data);
  if (data === undefined) return undefined;
  return { ...query, state: { ...query.state, data } };
}

function createClientWithQueries(client: UnknownRecord, queries: UnknownRecord[]) {
  return {
    ...client,
    clientState: {
      ...(client.clientState as UnknownRecord),
      mutations: [],
      queries,
    },
  };
}

function countPages(queries: UnknownRecord[]): number {
  return queries.reduce((total, query) => {
    const state = query.state;
    if (!isRecord(state) || !isRecord(state.data)) return total;
    return total + (Array.isArray(state.data.pages) ? state.data.pages.length : 0);
  }, 0);
}

export function preparePersistedQueryClient(
  client: unknown,
  namespace: string,
  maxBytes = PERSISTED_QUERY_MAX_BYTES,
  now: () => number = Date.now,
): PreparedPersistedClient {
  const startedAt = now();
  const source: UnknownRecord =
    isRecord(client) && isRecord(client.clientState)
      ? client
      : {
          timestamp: 0,
          buster: "",
          clientState: { mutations: [], queries: [] },
        };
  const sourceClientState = source.clientState as UnknownRecord;
  const sourceQueries: unknown[] = Array.isArray(sourceClientState.queries)
    ? sourceClientState.queries
    : [];
  const candidates = sourceQueries
    .map((query) => sanitizeAllowedQuery(query, namespace))
    .filter((query): query is UnknownRecord => query !== undefined)
    .sort((left, right) => {
      const leftPriority = isPersistedRewardSummaryQuery(left.queryKey) ? 1 : 0;
      const rightPriority = isPersistedRewardSummaryQuery(right.queryKey) ? 1 : 0;
      if (leftPriority !== rightPriority) return rightPriority - leftPriority;
      const leftUpdated = isRecord(left.state) ? Number(left.state.dataUpdatedAt) : 0;
      const rightUpdated = isRecord(right.state) ? Number(right.state.dataUpdatedAt) : 0;
      return rightUpdated - leftUpdated;
    });

  const retained: UnknownRecord[] = [];
  let persistedClient = createClientWithQueries(source, retained);
  let serialized = JSON.stringify({
    schemaVersion: PERSISTED_QUERY_SCHEMA_VERSION,
    namespace,
    client: persistedClient,
  } satisfies PersistedEnvelope);

  for (const query of candidates) {
    const nextQueries = [...retained, query];
    const nextClient = createClientWithQueries(source, nextQueries);
    const nextSerialized = JSON.stringify({
      schemaVersion: PERSISTED_QUERY_SCHEMA_VERSION,
      namespace,
      client: nextClient,
    } satisfies PersistedEnvelope);
    if (utf8Bytes(nextSerialized) > maxBytes) continue;
    retained.push(query);
    persistedClient = nextClient;
    serialized = nextSerialized;
  }

  return {
    client: persistedClient,
    serialized,
    metrics: {
      queryCount: retained.length,
      pageCount: countPages(retained),
      bytes: utf8Bytes(serialized),
      durationMs: Math.max(0, now() - startedAt),
    },
  };
}

export function restorePersistedQueryClient(
  serialized: string,
  namespace: string,
  maxBytes = PERSISTED_QUERY_MAX_BYTES,
  now: () => number = Date.now,
): PreparedPersistedClient | null {
  const startedAt = now();
  if (utf8Bytes(serialized) > maxBytes) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (
    !isRecord(envelope) ||
    envelope.schemaVersion !== PERSISTED_QUERY_SCHEMA_VERSION ||
    envelope.namespace !== namespace
  ) {
    return null;
  }

  const prepared = preparePersistedQueryClient(
    envelope.client,
    namespace,
    maxBytes,
    now,
  );
  return {
    ...prepared,
    metrics: {
      ...prepared.metrics,
      bytes: utf8Bytes(serialized),
      durationMs: Math.max(0, now() - startedAt),
    },
  };
}
