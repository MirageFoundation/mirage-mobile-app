type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isDeviceLocalUri = (value: unknown): boolean =>
  typeof value === "string" &&
  /^(file|content|ph|assets-library|blob):/i.test(value);

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
  if (value.media !== undefined && (
    !Array.isArray(value.media) ||
    !value.media.every(
      (uri) => typeof uri === "string" && !isDeviceLocalUri(uri),
    )
  )) {
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
  if (!isRecord(data)) return undefined;
  if (!("pages" in data)) return sanitizePostsResponse(data);
  if (!Array.isArray(data.pages)) return undefined;

  const sourcePages = data.pages;
  const pages = sourcePages.map(sanitizePostsResponse);
  if (pages.some((page) => page === undefined)) return undefined;
  return pages.every((page, index) => page === sourcePages[index])
    ? data
    : { ...data, pages };
}

export function sanitizePersistedPostQueries<T>(client: T): T {
  if (!isRecord(client) || !isRecord(client.clientState)) return client;
  const queries = client.clientState.queries;
  if (!Array.isArray(queries)) return client;

  let changed = false;
  const safeQueries = queries.flatMap((query) => {
    if (!isRecord(query) || !Array.isArray(query.queryKey)) {
      changed = true;
      return [];
    }
    if (query.queryKey[0] !== "posts") return [query];
    if (!isRecord(query.state)) {
      changed = true;
      return [];
    }

    const data = sanitizePersistedPostsData(query.state.data);
    if (data === undefined) {
      changed = true;
      return [];
    }
    if (data === query.state.data) return [query];
    changed = true;
    return [{ ...query, state: { ...query.state, data } }];
  });

  if (!changed) return client;
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: safeQueries,
    },
  } as T;
}
