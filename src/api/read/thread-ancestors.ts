import type { CommentsResponse, PostWithChildren } from "../types";

/**
 * Single-call thread shape (mirage-node `GET /api/get_comments`).
 *
 * The node returns the complete thread around a focused comment in one
 * response: the ancestor chain (root post first, immediate parent last), the
 * focused comment, and its already-nested reply subtree. This is the only
 * supported thread contract — `get_root_post_id` and `get_comment_context`
 * are no longer called.
 *
 * `resolved` distinguishes a real server response from a locally seeded
 * placeholder (the inbox writes a synthetic entry so a tapped reply paints
 * instantly, before its fetch lands). A placeholder has no `ancestors`, and
 * must NOT be read as "this comment is the root post" — callers wait for the
 * real response instead of falling back to extra requests.
 */
export type ThreadAncestors = {
  /** True once the server response carrying the ancestor chain has landed. */
  resolved: boolean;
  /** Root post of the thread — `ancestors[0]`, or `root` when it is the OP. */
  rootPost: PostWithChildren | null;
  /** Root post id, or null while unresolved. */
  rootPostId: string | null;
  /**
   * Ancestors between the root post and the focused comment, nearest-parent
   * last. Excludes the root post itself (it renders as the OP header).
   */
  parentChain: PostWithChildren[];
  /** Count of ancestors the node elided; drives "N more replies above". */
  omitted: number;
  /** True when `root` is a comment rather than the root post. */
  isComment: boolean;
};

const UNRESOLVED: ThreadAncestors = {
  resolved: false,
  rootPost: null,
  rootPostId: null,
  parentChain: [],
  omitted: 0,
  isComment: false,
};

/**
 * Derive the thread shape from a `get_comments` response.
 *
 * Returns `resolved: false` when the payload has not been fetched yet (or is a
 * seeded placeholder), so callers can keep rendering what they have without
 * mistaking an unknown chain for an empty one.
 */
export function readThreadAncestors(data?: CommentsResponse): ThreadAncestors {
  const root = data?.root;
  if (!root?.post_id) return UNRESOLVED;

  const ancestors = data?.ancestors;
  if (!Array.isArray(ancestors)) return UNRESOLVED;

  // A root post reports no ancestors and is its own root.
  if (ancestors.length === 0) {
    return {
      resolved: true,
      rootPost: root,
      rootPostId: root.post_id,
      parentChain: [],
      omitted: 0,
      isComment: false,
    };
  }

  const [rootPost, ...parentChain] = ancestors;
  return {
    resolved: true,
    rootPost,
    rootPostId: rootPost.post_id ?? null,
    parentChain,
    omitted: Math.max(0, data?.ancestors_omitted ?? 0),
    isComment: true,
  };
}
