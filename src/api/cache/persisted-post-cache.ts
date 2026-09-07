import { normalizeServerBaseUrl } from "@/src/api/server-runtime";
import { normalizeAccountIdentity } from "@/src/api/read/query-keys";

type UnknownRecord = Record<string, unknown>;

export const PERSISTED_QUERY_SCHEMA_VERSION = 5;
export const PERSISTED_QUERY_MAX_PAGES = 1;
export const PERSISTED_QUERY_MAX_BYTES = 1024 * 1024;
export const PERSISTED_QUERY_BUSTER = "launch-feed-cache-v5";
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

const LEGACY_QUERY_CACHE_KEY = "mirage-query-cache";
const QUERY_CACHE_KEY_PREFIX = "mirage-query-cache:";

export function isLegacyPersistedQueryCacheKey(key: string): boolean {
  if (key === LEGACY_QUERY_CACHE_KEY) return true;
  if (!key.startsWith(QUERY_CACHE_KEY_PREFIX)) return false;
  const encoded = key.slice(QUERY_CACHE_KEY_PREFIX.length);
  let namespace = encoded;
  try {
    namespace = decodeURIComponent(encoded);
  } catch {
    return false;
  }
  return /^v[1234]\|/.test(namespace);
}

export function removeLegacyPersistedQueryCaches(store: {
  getAllKeys?: () => string[];
  remove: (key: string) => unknown;
}): void {
  store.remove(LEGACY_QUERY_CACHE_KEY);
  const keys = typeof store.getAllKeys === "function" ? store.getAllKeys() : [];
  for (const key of keys) {
    if (key !== LEGACY_QUERY_CACHE_KEY && isLegacyPersistedQueryCacheKey(key)) {
      store.remove(key);
    }
  }
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

function isCanonicalLaunchLens(filters: UnknownRecord): boolean {
  return (
    filters.lens === "effective" &&
    filters.team_id === null &&
    filters.scope === "current" &&
    filters.lens_picks === ""
  );
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
  if (!isRecord(filters)) return false;
  if ("topic" in filters && filters.topic != null && filters.topic !== "") {
    return false;
  }
  if (
    typeof filters.community === "string" &&
    filters.community.trim().length > 0 &&
    filters.community.trim().toLowerCase() !== "all"
  ) {
    return false;
  }
  if (typeof filters.page === "number") return false;
  if (
    (filters.feed !== "home" && filters.feed !== "following") ||
    filters.by !== "magic"
  ) {
    return false;
  }
  return isCanonicalLaunchLens(filters);
}

export function isLaunchPersistedQuery(queryKey: unknown): boolean {
  return isLaunchCriticalFeedQuery(queryKey);
}

function isValidServedLens(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.requested !== "effective" &&
    value.requested !== "default" &&
    value.requested !== "team" &&
    value.requested !== "raw"
  ) {
    return false;
  }
  if (
    value.effective_mode !== 0 &&
    value.effective_mode !== 1 &&
    value.effective_mode !== 2
  ) {
    return false;
  }
  return (
    value.effective_team_id === null ||
    (typeof value.effective_team_id === "number" &&
      Number.isSafeInteger(value.effective_team_id))
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
    typeof value.timestamp !== "number" ||
    typeof value.community !== "string" ||
    typeof value.root_community !== "string" ||
    typeof value.thread_locked !== "boolean" ||
    !isValidServedLens(value.lens)
  ) {
    return false;
  }
  if (
    (typeof value.community !== "string" || value.community.length === 0) &&
    typeof value.topic === "string" &&
    value.topic.length > 0
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
  delete value.agent_edited;
  delete value.agent_edits_meta;
  delete value.appendices;
  delete value.topic;
  delete value.root_topic;
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

  const data = sanitizePersistedPostsData(query.state.data);
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
