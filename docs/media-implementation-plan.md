# Media System Implementation Plan

Bring the mobile app up to parity with the backend's multi-media post/comment support (v1.12.0+).

---

## Current State

### What already exists
- **Upload infrastructure**: `src/api/read/endpoints/media.ts` has full image + video upload (Cloudflare Images/Stream), including `getUploadUrl`, `uploadImage`, `uploadVideo`, `getVideoUrl`, `getImageUrl`.
- **Upload hooks**: `src/api/read/hooks/use-upload-media.ts` — `useUploadMedia` (images) and `useUploadVideo` (video with progress).
- **Draft store**: `src/stores/draft-store.ts` tracks `mediaUris: string[]` and `attachmentType`.
- **Post card rendering**: `PostCardMedia` component (`src/components/molecules/post-card-media.tsx`) renders a single `ResolvedMedia` with video/image/youtube/gif support.
- **Media preview modal**: `src/components/molecules/media-preview-modal.tsx` — fullscreen preview for a single media item.
- **Media type detection**: `src/components/molecules/post-card-utils.ts` — `getMediaTypeFromUrl`, `isDirectMediaUrl`, `resolvePostContent`, etc.
- **Types**: `PostMedia` type in `src/components/molecules/post-card-types.ts` already supports an array (`media?: PostMedia[]`).

### Gaps to fill
1. **API Post type missing `media` field** — `Post` in `src/api/types.ts` (line ~196) uses `thumbnail: string` but has no `media: string[]` field.
2. **Transform only uses `thumbnail`** — `src/api/read/utils/transform-post.ts` maps `apiPost.thumbnail` to a single-item media array; ignores `apiPost.media`.
3. **Canonical encoding missing media** — `canonBasePost` and `canonBaseEdit` in `src/api/write/signing/canonical.ts` do not encode the `media` repeated field (tag 105 for Post, tag 106 for Edit).
4. **Write endpoints don't pass `media`** — `CreatePostInput`, `CreateCommentInput`, `EditPostInput` in `src/api/write/endpoints/posts.ts` have no `media` field; payload sent to `/core/post` and `/core/edit` omits it.
5. **Create screen prepends URLs to content** — `src/pages/create-screen.tsx:248-260` still prepends image/video URLs into the `content` string instead of sending them in a `media` array.
6. **Single-media only in draft** — `draft-store.ts` `setAttachment` replaces the entire `mediaUris` array with a single URI; no multi-image picker flow.
7. **Post card shows only first media item** — `resolvePostContent` extracts `media?.[0]` as `primaryMedia`; `PostCardMedia` renders one item; `hasMultipleMedia`/`extraMediaCount` are computed but the gallery UI for swiping through multiple items is not implemented.
8. **Media preview modal is single-item** — No gallery/carousel in the fullscreen preview.
9. **Legacy content-URL fallback missing** — No explicit fallback that checks `content` first line for old posts with empty `media` array (partially handled by `resolvePostContent` extracting URLs from body, but not exactly matching the web behavior).
10. **No client-side validation** — No enforcement of max 10 items, max 2048 char URL, HTTPS-only before submission.
11. **Edit flow doesn't handle media** — `EditPostInput` and the edit UI don't support adding/removing/reordering media.
12. **Comment media** — Comments can also have media via `MsgPost` (target != ""), but the comment compose flow (`comment-compose-store.ts`, `comment-input.tsx`) has no media attachment support.

---

## Implementation Plan

### Phase 1: Data Layer (API types + canonical encoding)

#### 1.1 Add `media` field to API Post type
**File**: `src/api/types.ts`
- Add `media: string[]` to the `Post` interface (alongside existing `thumbnail`).

#### 1.2 Update post transform to use `media` array
**File**: `src/api/read/utils/transform-post.ts`
- If `apiPost.media` is a non-empty array, map each URL to a `PostMedia` object using `getMediaTypeFromUrl`.
- Fall back to `apiPost.thumbnail` (single-item) for backward compatibility.
- Implement legacy fallback: if both `media` and `thumbnail` are empty, check first line of `content` for a media URL (existing `resolvePostContent` logic already partially does this).

#### 1.3 Add `media` to canonical encoding
**File**: `src/api/write/signing/canonical.ts`

**MsgPost** — add `media` to `PostParams` and append after tag 104:
```
for each url in media:
    encString(105, url)
```

**MsgEdit** — add `media` to `EditParams` and append after tag 105 (override):
```
for each url in media:
    encString(106, url)
```

This is critical for PoW + signature correctness.

#### 1.4 Add `media` to write endpoint inputs
**File**: `src/api/write/endpoints/posts.ts`
- Add `media?: string[]` to `CreatePostInput`, `CreateCommentInput`, `EditPostInput`.
- Pass `media` in `payloadFields` for both `canonBasePost` and `canonBaseEdit` builders.
- Include `media` in the API payload sent to `/core/post` and `/core/edit`.

#### 1.5 Add client-side media validation
**File**: `src/api/write/utils/validate-media.ts` (new file)
- `validateMedia(urls: string[])` — enforce:
  - Max 10 items
  - Each URL ≤ 2048 characters
  - Each URL starts with `https://`
- Return error messages matching backend format.
- Call this before submission in create/edit flows.

---

### Phase 2: Upload + Create Flow

#### 2.1 Support multi-image upload
**File**: `src/pages/create-screen.tsx`
- Update image picker to allow `selectionLimit: 10` (currently 1 via `setAttachment` logic).
- Track multiple upload results as an array of final URLs.
- Upload all selected images in parallel using `uploadImageAndGetUrl`.
- Show upload progress for each item.

#### 2.2 Update draft store for multi-media
**File**: `src/stores/draft-store.ts`
- Update `setAttachment` to append URIs instead of replacing (for image type).
- Add `addMediaUri(uri: string)` and `removeMediaUri(uri: string)` actions.
- Enforce max 10 items in the store.

#### 2.3 Send `media` array instead of prepending to content
**File**: `src/pages/create-screen.tsx`
- Remove the content-prepend logic (`content = imageUrl + "\n\n" + content`).
- Instead, collect all uploaded URLs into a `media: string[]` and pass to `CreatePostMutationInput`.
- Links (non-media URLs) should remain in `content`.

#### 2.4 Update `usePost` hook for media
**File**: `src/api/write/hooks/use-post.ts`
- Add `media?: string[]` to `CreatePostMutationInput`.
- Pass `media` through to `createPost` endpoint.
- Update `buildOptimisticPost` to populate `media` field on the optimistic API post.

---

### Phase 3: Rendering Multi-Media

#### 3.1 Media gallery component (new)
**File**: `src/components/molecules/media-gallery.tsx` (new)
- Horizontal `FlatList` / pager for swiping through images.
- Dot indicators showing current position / total count.
- Support mixed media types (images, videos, GIFs).
- Auto-pause videos when swiped away.
- Reuse existing `PostCardMedia` logic for rendering individual items.

#### 3.2 Update `PostCardMedia` to support gallery
**File**: `src/components/molecules/post-card-media.tsx`
- Accept `media: PostMedia[]` (full array) instead of single `ResolvedMedia`.
- If `media.length === 1`, render current single-item view.
- If `media.length > 1`, render the new gallery component.
- Keep the `+N` badge for feed view (already computed in `resolvePostContent`).

#### 3.3 Update `resolvePostContent` for multi-media
**File**: `src/components/molecules/post-card-utils.ts`
- When `media` array has items, resolve all of them (not just `media?.[0]`).
- Return `resolvedMediaList: ResolvedMedia[]` alongside existing `resolvedMedia` (for backward compat).
- Update `ResolvedPostContent` type.

#### 3.4 Fullscreen media gallery modal
**File**: `src/components/molecules/media-preview-modal.tsx`
- Accept `media: ResolvedMedia[]` (array) and `initialIndex: number`.
- Swipeable fullscreen gallery with pinch-to-zoom per item.
- Show page indicator (e.g., "2 / 5").

#### 3.5 Update `PostCard` to pass full media array
**File**: `src/components/molecules/post-card.tsx`
- Pass entire `resolvedMediaList` to `PostCardMedia` and `MediaPreviewModal`.
- Track `selectedMediaIndex` for opening the preview at the tapped image.

---

### Phase 4: Edit Flow

#### 4.1 Edit UI with media management
**File**: `src/pages/create-screen.tsx` (edit mode) or wherever edit UI lives
- When editing, pre-populate with existing `media` URLs from the post.
- Allow removing existing media items (tap X).
- Allow adding new media items (up to 10 total).
- On submit, send full replacement `media` array (not a diff — the backend replaces entirely).

#### 4.2 Update `editPost` endpoint
**File**: `src/api/write/endpoints/posts.ts`
- `EditPostInput.media` is already proposed in Phase 1 — ensure it flows through to the API payload.

---

### Phase 5: Comment Media (Optional / Lower Priority)

#### 5.1 Comment compose with media
**Files**: `src/stores/comment-compose-store.ts`, `src/components/molecules/comment-input.tsx`
- Add optional media attachment to comment compose.
- Support image picker in comment input.
- Upload + send `media` array with `createComment`.

#### 5.2 Comment rendering with media
**File**: `src/components/molecules/comment-item.tsx`
- If comment has `media`, render inline (single image or small gallery).
- Tap to open fullscreen preview.

---

## File Change Summary

| File | Change |
|------|--------|
| `src/api/types.ts` | Add `media: string[]` to `Post` |
| `src/api/read/utils/transform-post.ts` | Map `apiPost.media` → `PostMedia[]` |
| `src/api/write/signing/canonical.ts` | Add `media` to `PostParams`/`EditParams`, encode tag 105/106 |
| `src/api/write/endpoints/posts.ts` | Add `media` to input types, pass in payload |
| `src/api/write/hooks/use-post.ts` | Add `media` to mutation input + optimistic post |
| `src/api/write/utils/validate-media.ts` | **New** — validation helper |
| `src/stores/draft-store.ts` | Multi-media support, add/remove actions |
| `src/pages/create-screen.tsx` | Multi-upload, send `media[]` instead of content-prepend |
| `src/components/molecules/media-gallery.tsx` | **New** — swipeable gallery component |
| `src/components/molecules/post-card-media.tsx` | Support gallery view for multi-media |
| `src/components/molecules/post-card-utils.ts` | Return `resolvedMediaList` array |
| `src/components/molecules/post-card.tsx` | Pass full media array to children |
| `src/components/molecules/media-preview-modal.tsx` | Gallery mode with index |
| `src/components/molecules/post-card-types.ts` | No change needed (already supports `media?: PostMedia[]`) |
| `src/stores/comment-compose-store.ts` | Add media fields (Phase 5) |
| `src/components/molecules/comment-input.tsx` | Media picker in comments (Phase 5) |
| `src/components/molecules/comment-item.tsx` | Render comment media (Phase 5) |

## Priority Order

1. **Phase 1** — Data layer (required for correctness; without canonical encoding, posts with media will fail signature verification)
2. **Phase 2** — Create flow (users can attach and send media)
3. **Phase 3** — Rendering (users can see multi-media posts from web users)
4. **Phase 4** — Edit flow
5. **Phase 5** — Comment media
