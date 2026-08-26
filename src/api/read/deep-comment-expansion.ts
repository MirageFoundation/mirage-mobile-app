import type { CommentsResponse, PostWithChildren } from "../types";

const MAX_DEEP_RESOLVE_DEPTH = 3;

export type CommentRequestParams = {
  post_id: string;
  address?: string;
};

export type CommentTreeFetcher = (
  params: CommentRequestParams,
  signal?: AbortSignal,
) => Promise<CommentsResponse>;

export type DeepCommentExpansionFailure =
  | "network"
  | "not_found"
  | "server"
  | "http"
  | "unknown";

export class DeepCommentExpansionError extends Error {
  readonly code = "DEEP_COMMENT_EXPANSION_FAILED";

  constructor(
    readonly classification: DeepCommentExpansionFailure,
    readonly status?: number,
  ) {
    super(
      "Unable to load the complete comment thread. Please retry the request.",
    );
    this.name = "DeepCommentExpansionError";
  }
}

function collectTruncated(nodes: PostWithChildren[]): PostWithChildren[] {
  const result: PostWithChildren[] = [];
  for (const node of nodes) {
    if (node.comments > 0 && (!node.children || node.children.length === 0)) {
      result.push(node);
    }
    if (node.children && node.children.length > 0) {
      result.push(...collectTruncated(node.children));
    }
  }
  return result;
}

function isCancellationOrStaleResponse(error: unknown): boolean {
  const candidate = error as { code?: unknown; name?: unknown } | null;
  return (
    candidate?.code === "ERR_CANCELED" ||
    candidate?.name === "AbortError" ||
    candidate?.name === "StaleServerResponseError"
  );
}

export function classifyDeepCommentExpansionFailure(
  error: unknown,
): DeepCommentExpansionFailure {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown };
  } | null;
  const status = candidate?.response?.status;

  if (status === 404) return "not_found";
  if (typeof status === "number" && status >= 500) return "server";
  if (typeof status === "number") return "http";
  if (
    candidate?.code === "ERR_NETWORK" ||
    candidate?.code === "ECONNABORTED" ||
    candidate?.message === "Network Error"
  ) {
    return "network";
  }
  return "unknown";
}

async function resolveDeepComments(
  nodes: PostWithChildren[],
  address: string | undefined,
  fetcher: CommentTreeFetcher,
  signal: AbortSignal | undefined,
  depth: number = 0,
): Promise<void> {
  if (depth >= MAX_DEEP_RESOLVE_DEPTH) return;

  const truncated = collectTruncated(nodes);
  if (truncated.length === 0) return;

  await Promise.all(
    truncated.map(async (node) => {
      try {
        const subTree = await fetcher(
          { post_id: node.post_id, address },
          signal,
        );
        node.children = subTree.children;
      } catch (error) {
        if (signal?.aborted || isCancellationOrStaleResponse(error)) {
          throw error;
        }
        const status = (error as { response?: { status?: unknown } } | null)
          ?.response?.status;
        throw new DeepCommentExpansionError(
          classifyDeepCommentExpansionFailure(error),
          typeof status === "number" ? status : undefined,
        );
      }
    }),
  );

  await resolveDeepComments(nodes, address, fetcher, signal, depth + 1);
}

export async function fetchCompleteCommentTree(
  params: CommentRequestParams,
  fetcher: CommentTreeFetcher,
  signal?: AbortSignal,
): Promise<CommentsResponse> {
  const data = await fetcher(params, signal);
  await resolveDeepComments(data.children, params.address, fetcher, signal);
  return data;
}
