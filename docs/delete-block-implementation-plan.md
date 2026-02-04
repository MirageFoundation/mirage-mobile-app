# Implementation Plan: Delete, Block & Report Functionality

## Quick Reference: What Can Users Do?

| Action | Target | Who Can Do It | Endpoint |
|--------|--------|---------------|----------|
| **Delete Post** | Own posts only | Post author only | `POST /core/delete_post` |
| **Delete Comment** | Own comments only | Comment author only | `POST /core/delete_post` |
| **Block Post** | Any post | Anyone (hides from YOUR feed) | `POST /core/block_post` |
| **Block Comment** | Any comment | Anyone (hides from YOUR feed) | `POST /core/block_post`* |
| **Block User** | Any user | Anyone (hides their content from YOUR feed) | `POST /core/block_user` |
| **Report Post** | Any post | Anyone | `POST /core/report` |
| **Report Comment** | Any comment | Anyone | `POST /core/report` |
| **Report User** | - | ❌ Not available | No endpoint |

**\*Note:** Comments use the same `block_post` endpoint - just pass the comment's txhash as the target.

### Key Distinction:
- **Delete** = "Remove MY content from the platform" (only works on your own content)
- **Block** = "Hide this from MY view" (works on anyone's content, only affects your feed)
- **Report** = "Flag this for moderation review" (works on any content)

---

## Current State Analysis

### API Layer - COMPLETE ✅

All hooks and endpoints are already implemented:

| Feature | Hook | Endpoint | File |
|---------|------|----------|------|
| Delete Post/Comment | `useDelete` | `POST /core/delete_post` | `src/api/write/hooks/use-post.ts:317-338` |
| Block User | `useBlockUser` | `POST /core/block_user` | `src/api/write/hooks/use-block.ts:28-51` |
| Unblock User | `useUnblockUser` | `POST /core/unblock_user` | `src/api/write/hooks/use-block.ts:53-75` |
| Block Post/Comment | `useBlockPost` | `POST /core/block_post` | `src/api/write/hooks/use-block.ts:81-104` |
| Unblock Post/Comment | `useUnblockPost` | `POST /core/unblock_post` | `src/api/write/hooks/use-block.ts:106-128` |
| Report Content | `useReport` | `POST /core/report` | `src/api/write/hooks/use-report.ts:28-38` |

**Endpoint implementations:**
- `src/api/write/endpoints/posts.ts` - `deletePost()` function
- `src/api/write/endpoints/social.ts` - `blockUser()`, `unblockUser()`, `blockPost()`, `unblockPost()` functions
- `src/api/write/endpoints/moderation.ts` - `report()` function

**Canonical builders (signing):**
- `src/api/write/signing/canonical.ts` - `canonBaseDelete`, `canonBaseBlockUser`, `canonBaseUnblockUser`, `canonBaseBlockPost`, `canonBaseUnblockPost`, `canonBaseReport`

---

### UI Layer - MISSING ❌

The hooks exist but are **not connected to any UI components**:

1. **CommentOptionsSheet** (`src/components/molecules/comment-options-sheet.tsx`)
   - Has `onDelete` prop (line 26) - shows only for own comments
   - Has `onReport` prop (line 28) - shows only for others' comments
   - Handler in `app/post/[id].tsx:747-771` only removes from local state with TODO comment
   - Does NOT call `useDelete` hook
   - Missing: Block User option
   - Missing: Block Comment option

2. **PostCard** (`src/components/molecules/post-card.tsx`)
   - Has `onMorePress` callback (line 99)
   - No options sheet exists for posts
   - Handler in `app/post/[id].tsx:807-809` just logs to console

3. **No confirmation dialogs** for destructive actions (delete, block)

4. **Report flow** - `useReport` hook exists but no UI triggers it

---

## Implementation Plan

### Step 1: Create Confirmation Popup Component
**File:** `src/components/molecules/confirmation-popup.tsx`

Create a reusable confirmation popup (based on `logout-confirmation-popup.tsx` pattern):

```typescript
interface ConfirmationPopupProps {
  visible: boolean;
  title: string;
  message: string;
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
```

Features:
- Blur background overlay
- Customizable icon and colors
- Destructive mode (red styling)
- Loading state on confirm button
- Haptic feedback

---

### Step 2: Create Report Sheet Component
**File:** `src/components/molecules/report-sheet.tsx`

Create a bottom sheet for reporting with reason selection:

```typescript
interface ReportSheetProps {
  visible: boolean;
  targetId: string;
  targetType: 'post' | 'comment';
  onSubmit: (reason: string) => void;
  onDismiss: () => void;
  isLoading?: boolean;
}
```

Features:
- Pre-defined reason options (spam, harassment, misinformation, etc.)
- Optional custom reason text input
- Character limit (200 chars per API)
- Submit/Cancel buttons

---

### Step 3: Create Post Options Sheet
**File:** `src/components/molecules/post-options-sheet.tsx`

Create a bottom sheet for post actions (based on `CommentOptionsSheet` pattern):

```typescript
interface PostOptionsSheetProps {
  post?: Post | null;
  isOwnPost?: boolean;
  onSave?: () => void;
  onCopyLink?: () => void;
  onShare?: () => void;
  onBlockPost?: () => void;
  onBlockUser?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onDismiss?: () => void;
}
```

Menu items:
| Item | When Shown | Action |
|------|------------|--------|
| Save Post | Always | Save to bookmarks |
| Copy Link | Always | Copy post URL |
| Share | Always | Native share |
| Block Post | Others' posts only | Hide post from feed |
| Block User | Others' posts only | Hide all user content |
| Delete Post | Own posts only | Delete permanently |
| Report Post | Others' posts only | Open report sheet |

Uses `GorhomPopupSheet` component.

---

### Step 4: Create useDeleteHandler Hook
**File:** `src/hooks/use-delete-handler.ts`

Handler hook that orchestrates the delete flow:

```typescript
interface UseDeleteHandlerOptions {
  onSuccess?: (targetId: string) => void;
  onError?: (targetId: string, error: Error) => void;
}

interface UseDeleteHandlerReturn {
  requestDelete: (targetId: string, targetType: 'post' | 'comment') => void;
  confirmDelete: () => void;
  cancelDelete: () => void;
  isDeleting: boolean;
  showConfirmation: boolean;
  pendingTarget: { id: string; type: 'post' | 'comment' } | null;
}
```

Flow:
1. User taps delete → `requestDelete()` called
2. Show confirmation popup
3. User confirms → `confirmDelete()` → Show loading toast "Deleting..."
4. Update toast with PoW progress %
5. Call `useDelete` mutation
6. On success: Toast "Deleted!", call `onSuccess`
7. On error: Toast "Failed to delete", call `onError`

---

### Step 5: Create useBlockHandler Hook
**File:** `src/hooks/use-block-handler.ts`

Handler hook that orchestrates the block flow:

```typescript
interface UseBlockHandlerOptions {
  onSuccess?: (targetId: string, blockType: 'user' | 'post' | 'comment') => void;
  onError?: (targetId: string, error: Error) => void;
}

interface UseBlockHandlerReturn {
  requestBlockUser: (userAddress: string, username?: string) => void;
  requestBlockPost: (postId: string) => void;
  requestBlockComment: (commentId: string) => void;
  confirmBlock: () => void;
  cancelBlock: () => void;
  isBlocking: boolean;
  showConfirmation: boolean;
  pendingBlock: { id: string; type: 'user' | 'post' | 'comment'; label?: string } | null;
}
```

Flow:
1. User taps block → `requestBlockUser()`, `requestBlockPost()`, or `requestBlockComment()` called
2. Show confirmation popup "Block @username?" / "Block this post?" / "Block this comment?"
3. User confirms → `confirmBlock()` → Show loading toast "Blocking..."
4. Update toast with PoW progress %
5. Call `useBlockUser` or `useBlockPost` mutation
6. On success: Toast "Blocked!", call `onSuccess`
7. On error: Toast "Failed to block", call `onError`

---

### Step 6: Create useReportHandler Hook
**File:** `src/hooks/use-report-handler.ts`

Handler hook that orchestrates the report flow:

```typescript
interface UseReportHandlerOptions {
  onSuccess?: (targetId: string) => void;
  onError?: (targetId: string, error: Error) => void;
}

interface UseReportHandlerReturn {
  requestReport: (targetId: string, targetType: 'post' | 'comment') => void;
  submitReport: (reason: string) => void;
  cancelReport: () => void;
  isReporting: boolean;
  showReportSheet: boolean;
  pendingTarget: { id: string; type: 'post' | 'comment' } | null;
}
```

Flow:
1. User taps report → `requestReport()` called
2. Show report sheet with reason options
3. User selects reason and submits → `submitReport()` → Show loading toast "Reporting..."
4. Update toast with PoW progress %
5. Call `useReport` mutation
6. On success: Toast "Reported! Thanks for helping keep Mirage safe."
7. On error: Toast "Failed to report"

---

### Step 7: Update CommentOptionsSheet
**File:** `src/components/molecules/comment-options-sheet.tsx`

Add Block User and Block Comment options:

```typescript
// Add to props
onBlockUser?: () => void;
onBlockComment?: () => void;

// Add menu items (for others' comments only)
{!isOwnComment && (
  <>
    <GorhomPopupSheet.Item
      icon={Ionicons}
      iconName="eye-off-outline"
      title="Block Comment"
      onPress={handleBlockComment}
    />
    <GorhomPopupSheet.Item
      icon={Ionicons}
      iconName="ban-outline"
      title={`Block @${comment?.author.username}`}
      onPress={handleBlockUser}
    />
  </>
)}
```

---

### Step 8: Wire Up in PostDetailScreen
**File:** `app/post/[id].tsx`

#### 8.1 Add imports
```typescript
import {
  PostOptionsSheet,
  PostOptionsSheetRef,
  ConfirmationPopup,
  ReportSheet
} from "@/src/components/molecules";
import { useDeleteHandler, useBlockHandler, useReportHandler } from "@/src/hooks";
```

#### 8.2 Add refs and hooks
```typescript
const postOptionsSheetRef = useRef<PostOptionsSheetRef>(null);

const deleteHandler = useDeleteHandler({
  onSuccess: (targetId) => {
    // Remove from local state, refetch, navigate back if post deleted
  }
});

const blockHandler = useBlockHandler({
  onSuccess: (targetId, blockType) => {
    // Hide content, refetch
  }
});

const reportHandler = useReportHandler({
  onSuccess: (targetId) => {
    // Show success feedback
  }
});
```

#### 8.3 Wire PostCard onMorePress
```typescript
const handlePostMorePress = useCallback(() => {
  postOptionsSheetRef.current?.present();
}, []);

// In PostCard
<PostCard
  ...
  onMorePress={handlePostMorePress}
/>
```

#### 8.4 Update handleDeleteComment
Replace the TODO implementation with actual delete logic:
```typescript
const handleDeleteComment = useCallback(() => {
  if (!selectedComment) return;
  deleteHandler.requestDelete(selectedComment.id, 'comment');
}, [selectedComment, deleteHandler]);
```

#### 8.5 Add new components to render
```typescript
{/* Post Options Sheet */}
<PostOptionsSheet
  ref={postOptionsSheetRef}
  post={displayPost}
  isOwnPost={currentUser?.id === displayPost?.author.id}
  onDelete={() => deleteHandler.requestDelete(displayPost?.id, 'post')}
  onBlockPost={() => blockHandler.requestBlockPost(displayPost?.id)}
  onBlockUser={() => blockHandler.requestBlockUser(displayPost?.author.id, displayPost?.author.username)}
  onReport={() => reportHandler.requestReport(displayPost?.id, 'post')}
  onDismiss={() => {}}
/>

{/* Delete Confirmation Popup */}
<ConfirmationPopup
  visible={deleteHandler.showConfirmation}
  title={deleteHandler.pendingTarget?.type === 'post' ? 'Delete Post?' : 'Delete Comment?'}
  message="This action cannot be undone."
  icon="trash-outline"
  isDestructive
  isLoading={deleteHandler.isDeleting}
  confirmText="Delete"
  onConfirm={deleteHandler.confirmDelete}
  onCancel={deleteHandler.cancelDelete}
/>

{/* Block Confirmation Popup */}
<ConfirmationPopup
  visible={blockHandler.showConfirmation}
  title={`Block ${blockHandler.pendingBlock?.label || 'this content'}?`}
  message="You won't see this content in your feed anymore."
  icon="ban-outline"
  isLoading={blockHandler.isBlocking}
  confirmText="Block"
  onConfirm={blockHandler.confirmBlock}
  onCancel={blockHandler.cancelBlock}
/>

{/* Report Sheet */}
<ReportSheet
  visible={reportHandler.showReportSheet}
  targetId={reportHandler.pendingTarget?.id}
  targetType={reportHandler.pendingTarget?.type}
  onSubmit={reportHandler.submitReport}
  onDismiss={reportHandler.cancelReport}
  isLoading={reportHandler.isReporting}
/>
```

---

### Step 9: Export New Components
**File:** `src/components/molecules/index.ts`
```typescript
export * from "./confirmation-popup";
export * from "./post-options-sheet";
export * from "./report-sheet";
```

**File:** `src/hooks/index.ts`
```typescript
export * from "./use-delete-handler";
export * from "./use-block-handler";
export * from "./use-report-handler";
```

---

## Files Summary

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/molecules/confirmation-popup.tsx` | Reusable confirmation modal |
| `src/components/molecules/post-options-sheet.tsx` | Options menu for posts |
| `src/components/molecules/report-sheet.tsx` | Report reason selection sheet |
| `src/hooks/use-delete-handler.ts` | Delete with confirmation + toast |
| `src/hooks/use-block-handler.ts` | Block with confirmation + toast |
| `src/hooks/use-report-handler.ts` | Report with reason sheet + toast |

### Files to Modify
| File | Changes |
|------|---------|
| `app/post/[id].tsx` | Wire up all handlers, add sheets and popups |
| `src/components/molecules/comment-options-sheet.tsx` | Add Block User, Block Comment options |
| `src/components/molecules/index.ts` | Export new components |
| `src/hooks/index.ts` | Export new hooks |

---

## Not In Scope (Future Work)

1. **Delete Account** - No endpoint exists in the API documentation
2. **Report User** - No endpoint exists (only content can be reported)
3. **Block User from Profile Page** - No other-user profile page exists yet
4. **Unblock UI** - Settings page for managing blocked users/posts
5. **View Reported Content** - Admin/moderation panel

---

## Verification Checklist

After implementation, test the following:

### Delete Post (Own Posts Only)
- [ ] Create a test post
- [ ] Open post detail, tap "..." menu
- [ ] Verify "Delete Post" option appears ONLY for own posts
- [ ] Tap delete, verify confirmation popup shows
- [ ] Confirm delete, verify toast shows with PoW progress
- [ ] Verify post is removed and navigates back

### Delete Comment (Own Comments Only)
- [ ] Create a test comment
- [ ] Tap "..." on comment
- [ ] Verify "Delete Comment" option appears ONLY for own comments
- [ ] Tap delete, verify confirmation popup shows
- [ ] Confirm delete, verify toast shows with PoW progress
- [ ] Verify comment is removed

### Block User (Others' Content)
- [ ] On another user's post, tap "..."
- [ ] Verify "Block @username" option appears
- [ ] Tap block, verify confirmation popup shows
- [ ] Confirm block, verify toast shows with PoW progress
- [ ] Verify user's content is hidden from feeds

### Block Post (Others' Content)
- [ ] On another user's post, tap "..."
- [ ] Verify "Block Post" option appears
- [ ] Tap block, verify confirmation popup shows
- [ ] Confirm block, verify toast shows with PoW progress
- [ ] Verify post is hidden from feed

### Block Comment (Others' Content)
- [ ] On another user's comment, tap "..."
- [ ] Verify "Block Comment" option appears
- [ ] Tap block, verify confirmation popup shows
- [ ] Confirm block, verify toast shows with PoW progress
- [ ] Verify comment is hidden

### Report Post (Others' Content)
- [ ] On another user's post, tap "..."
- [ ] Verify "Report Post" option appears
- [ ] Tap report, verify report sheet shows with reason options
- [ ] Select reason and submit
- [ ] Verify toast shows with PoW progress
- [ ] Verify success message

### Report Comment (Others' Content)
- [ ] On another user's comment, tap "..."
- [ ] Verify "Report Comment" option appears
- [ ] Tap report, verify report sheet shows with reason options
- [ ] Select reason and submit
- [ ] Verify toast shows with PoW progress
- [ ] Verify success message
