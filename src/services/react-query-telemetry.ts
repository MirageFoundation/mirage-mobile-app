const SAFE_MUTATION_OPERATIONS = new Set([
  "write.agents.set",
  "write.annotate",
  "write.award.give",
  "write.biography.set",
  "write.block.post",
  "write.block.topic",
  "write.block.unblock-post",
  "write.block.unblock-topic",
  "write.block.unblock-user",
  "write.block.user",
  "write.follow.disable-agent",
  "write.follow.enable-agent",
  "write.follow.topic",
  "write.follow.toggle-topic",
  "write.follow.toggle-user",
  "write.follow.unfollow-topic",
  "write.follow.unfollow-user",
  "write.follow.user",
  "write.media.upload",
  "write.post.comment",
  "write.post.comment-with-confirmation",
  "write.post.create",
  "write.post.create-with-confirmation",
  "write.post.delete",
  "write.post.edit",
  "write.report",
  "write.rewards.claim",
  "write.tokens.gift-subscription",
  "write.tokens.send",
  "write.tokens.set-auto-renewal",
  "write.tokens.upgrade-level",
  "write.user.delete",
  "write.username.set",
  "write.vote",
  "write.vote.optimistic",
]);

const SAFE_QUERY_OPERATIONS = new Set([
  "agents", "batchUsernames", "commentContext", "comments", "config", "inbox",
  "inviteCode", "inviteCodes", "leaderboard", "nodeConfig", "parameters", "peers",
  "posts", "referral", "resolve", "rewards", "rootPostId", "search", "stats",
  "topics", "tx", "user", "users",
]);

export const MAX_REACT_QUERY_METADATA_BYTES = 160;

export type ReactQueryErrorMetadata = {
  operation: string;
  error_class: "http" | "network" | "unexpected";
  status?: number;
};

function getStatus(error: unknown): number | undefined {
  const value = (error as any)?.response?.status ?? (error as any)?.status;
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function getErrorClass(error: unknown, status?: number): ReactQueryErrorMetadata["error_class"] {
  if (status !== undefined) return "http";
  const code = (error as any)?.code;
  return code === "ERR_NETWORK" || code === "ECONNABORTED" ? "network" : "unexpected";
}

export function buildMutationErrorMetadata(
  mutationKey: readonly unknown[] | undefined,
  error: unknown,
): ReactQueryErrorMetadata {
  const candidate = mutationKey?.every((part) => typeof part === "string")
    ? mutationKey.join(".")
    : "";
  const status = getStatus(error);
  return {
    operation: SAFE_MUTATION_OPERATIONS.has(candidate) ? candidate : "unknown",
    error_class: getErrorClass(error, status),
    ...(status !== undefined ? { status } : {}),
  };
}

export function buildQueryErrorMetadata(
  queryKey: readonly unknown[] | undefined,
  error: unknown,
): ReactQueryErrorMetadata {
  const candidate = queryKey?.[0] === "server" ? queryKey[2] : queryKey?.[0];
  const status = getStatus(error);
  return {
    operation: typeof candidate === "string" && SAFE_QUERY_OPERATIONS.has(candidate)
      ? candidate
      : "unknown",
    error_class: getErrorClass(error, status),
    ...(status !== undefined ? { status } : {}),
  };
}

export function sanitizedTelemetryError(
  scope: "query" | "mutation" | "push-notifications" | "media-upload",
  metadata: Pick<ReactQueryErrorMetadata, "error_class" | "status">,
): Error {
  const statusSuffix = metadata.status === undefined ? "" : ` (${metadata.status})`;
  const error = new Error(`${scope} ${metadata.error_class} failure${statusSuffix}`);
  error.name = "SanitizedTelemetryError";
  return error;
}
