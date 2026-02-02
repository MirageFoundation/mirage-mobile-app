# Endpoint Migration Plan: `/p/[id]` & `/u/[id]`

> **Scope**: Migrate from old GET endpoints to new REST-style path-param endpoints.
>
> | Old | New | Notes |
> |-----|-----|-------|
> | `GET /get_comments?post_id=...` | `GET /p/[id]` | Unified post/comment detail |
> | `GET /get_root_post_id?comment_id=...` | _(removed)_ | Folded into `/p/[id]` |
> | `GET /get_comment_context?comment_id=...` | _(removed)_ | Use `/p/[id]?depth=1-5` |
> | `GET /get_profile?address=...` | `GET /u/[id\|username]` | Accepts username or address |

---

## Step 1 — Update Types (`src/api/types.ts`)

### Add `PostDetailResponse`

```typescript
export interface PostDetailResponse {
  root: PostWithChildren;
  children: PostWithChildren[];
  latest_inbox_timestamp?: number;
  context?: Post[]; // Parent chain when depth is specified
}
```

### Keep (but deprecate)

- `CommentsResponse` — alias to `PostDetailResponse` temporarily if needed
- `RootPostIdResponse` — **remove** (no longer returned by any endpoint)
- `CommentContextResponse` — **remove** (context is now inside `PostDetailResponse`)

### Update `GetProfileParams`

```typescript
export interface GetProfileParams {
  id: string; // username OR mirage1... address
}
```

---

## Step 2 — Update Endpoint Functions (`src/api/read/endpoints/`)

### `posts.ts` — Replace 3 functions with 1

**Remove:**
- `getComments()` + `GetCommentsParams`
- `getRootPostId()` + `GetRootPostIdParams`
- `getCommentContext()` + `GetCommentContextParams`

**Add:**

```typescript
export interface GetPostDetailParams {
  id: string;        // post or comment txhash
  address?: string;  // viewer address
  depth?: number;    // 1-5, optional parent context
}

export async function getPostDetail(
  params: GetPostDetailParams
): Promise<PostDetailResponse> {
  const { id, ...query } = params;
  return api.get<PostDetailResponse>(`/p/${id}`, query);
}
```

**Imports to update:** Remove `CommentsResponse`, `RootPostIdResponse`, `CommentContextResponse` from import; add `PostDetailResponse`.

### `users.ts` — Update `getProfile()`

**Before:**
```typescript
export async function getProfile(params: { address: string }) {
  return api.get<ProfileResponse>("/get_profile", params);
}
```

**After:**
```typescript
export async function getProfile(params: { id: string }) {
  const { id } = params;
  return api.get<ProfileResponse>(`/u/${id}`);
}
```

The `id` param can be either a `mirage1...` address or a username — the backend resolves it.

---

## Step 3 — Update Query Keys (`src/api/read/query-keys.ts`)

**Remove:**
```typescript
comments: (postId, address) => ["comments", postId, address],
rootPostId: (commentId) => ["rootPostId", commentId],
commentContext: (commentId, maxDepth) => ["commentContext", commentId, maxDepth],
```

**Add:**
```typescript
postDetail: (id: string, address?: string, depth?: number) =>
  ["postDetail", id, address, depth] as const,
```

**No change needed** for `profile` key — keep `["user", "profile", address]`.
The hook will resolve username → address before using as key (or key by the raw `id`).

---

## Step 4 — Update/Rename Hooks (`src/api/read/hooks/`)

### Rename `use-comments.ts` → `use-post-detail.ts`

**Remove:** `useComments`, `useRootPostId`, `useCommentContext`

**Add:**

```typescript
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../query-keys";
import { getPostDetail } from "../endpoints/posts";
import { useAuthStore } from "@/src/stores";

export function usePostDetail(
  id: string | undefined | null,
  depth?: number
) {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);

  return useQuery({
    queryKey: queryKeys.postDetail(id!, walletAddress ?? undefined, depth),
    queryFn: () =>
      getPostDetail({
        id: id!,
        address: walletAddress ?? undefined,
        depth,
      }),
    enabled: !!id,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
```

### Update `use-user-status.ts` — `useProfile` / `useProfileByAddress`

The hooks currently pass `{ address }` to `getProfile()`. Update to pass `{ id }`:

```typescript
export function useProfile() {
  const walletAddress = useAuthStore((s) => s.user?.walletAddress);
  return useQuery({
    queryKey: queryKeys.profile(walletAddress!),
    queryFn: () => getProfile({ id: walletAddress! }),
    enabled: !!walletAddress,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 60,
  });
}

export function useProfileByAddress(address: string | undefined | null) {
  return useQuery({
    queryKey: queryKeys.profile(address!),
    queryFn: () => getProfile({ id: address! }),
    enabled: !!address,
    staleTime: 1000 * 60,
  });
}
```

> **Future**: Add `useProfileByUsername(username)` that also calls `getProfile({ id: username })`.

### Update `hooks/index.ts` exports

```diff
-export {
-  useComments,
-  useRootPostId,
-  useCommentContext,
-} from "./use-comments";
+export { usePostDetail } from "./use-post-detail";
```

---

## Step 5 — Update Cache Invalidation (Write Hooks)

Every `["comments"]` invalidation must become `["postDetail"]`.

| File | Lines | Change |
|------|-------|--------|
| `src/api/write/hooks/use-vote.ts` | 61, 134, 139, 170 | `["comments"]` → `["postDetail"]` |
| `src/api/write/hooks/use-post.ts` | 253, 320, 347 | `["comments"]` → `["postDetail"]` |
| `src/api/write/hooks/use-block.ts` | 48, 72, 101, 125 | `["comments"]` → `["postDetail"]` |

**Find & replace** (exact string):
```
queryKey: ["comments"]  →  queryKey: ["postDetail"]
```

---

## Step 6 — Update Consumers (Screens & Components)

### `app/post/[id].tsx` (Post Detail Screen)

```diff
-import { useComments, ... } from "@/src/api/read";
+import { usePostDetail, ... } from "@/src/api/read";

-const { data: commentsData, isLoading: isLoadingComments, ... } = useComments(id);
+const { data: postDetailData, isLoading: isLoadingPostDetail, ... } = usePostDetail(id);
```

The response shape is the same (`root`, `children`, `latest_inbox_timestamp`) so the rest of the screen should work as-is with a variable rename.

### `src/components/molecules/profile-comment-item.tsx`

Currently uses `useRootPostId` as a fallback when `comment.root_post_id` is invalid.

**Option A (preferred):** The comment's `root_post_id` field should now always be populated by the backend. Remove the `useRootPostId` fallback entirely:

```diff
-import { useRootPostId } from "@/src/api/read";

-const { data: rootPostData, isLoading: isLoadingRootPostId } = useRootPostId(
-  !hasValidRootPostId ? comment.post_id : null,
-);
-const resolvedRootPostId = hasValidRootPostId
-  ? comment.root_post_id
-  : rootPostData?.root_post_id || null;
-const isLoading = !hasValidRootPostId && isLoadingRootPostId;

+const resolvedRootPostId = comment.root_post_id || null;
+const isLoading = false;
```

**Option B (safe fallback):** If `root_post_id` can still be missing, use `usePostDetail(comment.post_id, 1)` and read `context[0]` — but this is heavier. Prefer Option A.

### Profile screens (no functional change needed)

`useProfile()` and `useProfileByAddress()` are updated in Step 4. The call sites in these files stay the same — only the internal endpoint URL changes:

- `src/pages/profile-screen.tsx`
- `src/pages/user-profile-screen.tsx`
- `src/components/molecules/profile-about-tab.tsx`

No import or usage changes needed in these files.

---

## Step 7 — Clean Up Types (`src/api/types.ts`)

After all consumers are migrated:

1. **Remove** `CommentsResponse` (replaced by `PostDetailResponse`)
2. **Remove** `RootPostIdResponse`
3. **Remove** `CommentContextResponse`

Or keep `CommentsResponse` as a type alias during transition:
```typescript
/** @deprecated Use PostDetailResponse */
export type CommentsResponse = PostDetailResponse;
```

---

## File Change Summary

| # | File | Action |
|---|------|--------|
| 1 | `src/api/types.ts` | Add `PostDetailResponse`, remove 2 old types |
| 2 | `src/api/read/endpoints/posts.ts` | Replace 3 functions → `getPostDetail()` |
| 3 | `src/api/read/endpoints/users.ts` | Update `getProfile()` param: `address` → `id` |
| 4 | `src/api/read/query-keys.ts` | Replace 3 keys → `postDetail` |
| 5 | `src/api/read/hooks/use-comments.ts` | **Delete** (replaced by use-post-detail.ts) |
| 6 | `src/api/read/hooks/use-post-detail.ts` | **Create** — single `usePostDetail` hook |
| 7 | `src/api/read/hooks/use-user-status.ts` | Update `getProfile({ address })` → `getProfile({ id })` |
| 8 | `src/api/read/hooks/index.ts` | Update exports |
| 9 | `src/api/write/hooks/use-vote.ts` | `["comments"]` → `["postDetail"]` (4 places) |
| 10 | `src/api/write/hooks/use-post.ts` | `["comments"]` → `["postDetail"]` (3 places) |
| 11 | `src/api/write/hooks/use-block.ts` | `["comments"]` → `["postDetail"]` (4 places) |
| 12 | `app/post/[id].tsx` | `useComments` → `usePostDetail` |
| 13 | `src/components/molecules/profile-comment-item.tsx` | Remove `useRootPostId` usage |

**Total: 13 files** (1 delete, 1 create, 11 modify)

---

## Implementation Order

```
Phase 1 — Types & Endpoints (no consumers break yet)
  ├── 1. Add PostDetailResponse to types.ts
  ├── 2. Add getPostDetail() to posts.ts (keep old functions)
  └── 3. Update getProfile() in users.ts (keep old param temporarily)

Phase 2 — Hooks (new hook + update existing)
  ├── 4. Create use-post-detail.ts
  ├── 5. Update use-user-status.ts (getProfile param)
  └── 6. Update hooks/index.ts (add new export, keep old)

Phase 3 — Consumers (swap to new hooks)
  ├── 7. Update app/post/[id].tsx
  ├── 8. Update profile-comment-item.tsx
  └── 9. Update write hooks cache keys (use-vote, use-post, use-block)

Phase 4 — Cleanup
  ├── 10. Delete use-comments.ts
  ├── 11. Remove old exports from hooks/index.ts
  ├── 12. Remove old functions from posts.ts
  └── 13. Remove old types from types.ts
```

---

## Testing Checklist

- [ ] Post detail screen loads post + comments via `/p/[id]`
- [ ] Comment navigation works (no `useRootPostId` needed)
- [ ] Parent context loads when viewing a comment with `?depth=N`
- [ ] Profile screen loads via `/u/[address]`
- [ ] Other-user profile loads via `/u/[username]` or `/u/[address]`
- [ ] Voting invalidates `["postDetail"]` cache correctly
- [ ] Creating a comment invalidates `["postDetail"]` cache correctly
- [ ] Blocking a post/user invalidates `["postDetail"]` cache correctly
- [ ] No references to `get_comments`, `get_root_post_id`, `get_comment_context`, or old `get_profile` remain in codebase
