# Profile Posts & Comments Integration Plan

> **Feature**: Display user's posts and comments in the Profile screen tabs
>
> **Status**: Completed
>
> **Dependencies**: `useInfiniteUserPosts` hook (already implemented)

---

## Overview

Currently, the Profile screen has three tabs (Posts, Comments, About) that show empty state placeholders. This plan covers integrating the `GET /get_user_posts` endpoint to display actual user content.

---

## API Reference

### Endpoint: `GET /get_user_posts`

**Location**: `src/api/read/endpoints/posts.ts:49-53`

```typescript
interface GetUserPostsParams {
  owner: string;              // Required - User's wallet address
  address?: string;           // Optional - Viewer's address for vote data
  type?: "submissions" | "comments";  // Filter type
  page?: number;
  limit?: number;             // max 50
}
```

**Response**: `PostsResponse` (same as feed posts)

```typescript
interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

interface Post {
  post_id: string;        // txhash
  user_id: string;        // owner address
  username: string;
  timestamp: number;
  topic: string;
  root_topic: string;
  root_post_id: string;
  title: string;
  content: string;
  tag: string;
  edited_at: number;
  thumbnail: string;
  points: number;
  comments: number;
  user_vote: number;      // -1, 0, 1
  user_weight: number;
}
```

### Existing Hooks

**Location**: `src/api/read/hooks/use-posts.ts:67-112`

```typescript
// Single page fetch
useUserPosts(owner: string | undefined | null, type?: "submissions" | "comments")

// Infinite scroll
useInfiniteUserPosts(owner: string | undefined | null, params?: { type?, limit? })
```

---

## Current Implementation

### Profile Screen Structure

**File**: `src/pages/profile-screen.tsx`

```
ProfileScreen
├── ProfileHeaderBar (fixed header)
├── ProfileContent (avatar, username, stats)
├── ProfileTabBar (Posts | Comments | About)
└── PagerView
    ├── ProfileTabContent (tabType="posts")
    ├── ProfileTabContent (tabType="comments")
    └── ProfileTabContent (tabType="about")
```

### Current ProfileTabContent

**File**: `src/components/molecules/profile-tabs.tsx:70-113`

Currently renders only empty states with:
- Image placeholder
- "You don't have any posts/comments yet" message
- "Update Settings" button

---

## Implementation Plan

### Step 1: Create Profile Post Item Component

**File**: `src/components/molecules/profile-post-item.tsx`

A compact post item for profile lists (different from feed PostCard).

```typescript
interface ProfilePostItemProps {
  post: Post;
  onPress: (postId: string) => void;
  onVote?: (postId: string, direction: number) => void;
}
```

**Design**:
```
┌────────────────────────────────────────────────────────────┐
│  [Topic chip]                                    3h ago    │
│                                                            │
│  Post title goes here and can wrap to multiple lines...    │
│                                                            │
│  👍 123  👎 12  💬 45                                      │
└────────────────────────────────────────────────────────────┘
```

**Features**:
- Topic chip (tappable, navigates to topic feed)
- Relative timestamp
- Title (max 2 lines, truncated)
- Points and comment count
- Thumbnail preview if available (optional)
- Tap to navigate to post detail

---

### Step 2: Create Profile Comment Item Component

**File**: `src/components/molecules/profile-comment-item.tsx`

A compact comment item showing context of the parent post.

```typescript
interface ProfileCommentItemProps {
  comment: Post;
  onPress: (commentId: string, rootPostId: string) => void;
  onVote?: (commentId: string, direction: number) => void;
}
```

**Design**:
```
┌────────────────────────────────────────────────────────────┐
│  Replied to: "Original post title here..."        2h ago   │
│  ──────────────────────────────────────────────────────    │
│                                                            │
│  Your comment text goes here and can wrap to multiple      │
│  lines if needed...                                        │
│                                                            │
│  👍 45  👎 2                                               │
└────────────────────────────────────────────────────────────┘
```

**Features**:
- "Replied to:" context with parent post title
- Relative timestamp
- Comment content (max 3 lines, truncated)
- Points display
- Tap to navigate to comment in post detail

---

### Step 3: Create Profile Posts List Component

**File**: `src/components/molecules/profile-posts-list.tsx`

Reusable list component for both posts and comments tabs.

```typescript
interface ProfilePostsListProps {
  owner: string;
  type: "submissions" | "comments";
  ListEmptyComponent?: React.ReactNode;
  onPostPress: (postId: string) => void;
  onCommentPress: (commentId: string, rootPostId: string) => void;
}
```

**Implementation**:
```typescript
export function ProfilePostsList({
  owner,
  type,
  ListEmptyComponent,
  onPostPress,
  onCommentPress
}: ProfilePostsListProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteUserPosts(owner, { type, limit: 20 });

  const posts = useMemo(() =>
    data?.pages.flatMap(page => page.posts) ?? [],
    [data]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <ProfilePostsListSkeleton />;
  }

  if (isError) {
    return <ProfilePostsListError onRetry={refetch} />;
  }

  if (posts.length === 0) {
    return ListEmptyComponent ?? <ProfilePostsEmptyState type={type} />;
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.post_id}
      renderItem={({ item }) =>
        type === "submissions" ? (
          <ProfilePostItem post={item} onPress={onPostPress} />
        ) : (
          <ProfileCommentItem comment={item} onPress={onCommentPress} />
        )
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      refreshing={false}
      onRefresh={refetch}
      ListFooterComponent={
        isFetchingNextPage ? <ActivityIndicator /> : null
      }
      ItemSeparatorComponent={() => <Divider />}
    />
  );
}
```

---

### Step 4: Update ProfileTabContent

**File**: `src/components/molecules/profile-tabs.tsx`

Update to accept data and render the list or empty state.

```typescript
interface ProfileTabContentProps {
  tabType: TabType;
  owner: string;
  onSettingsPress?: () => void;
  onPostPress: (postId: string) => void;
  onCommentPress: (commentId: string, rootPostId: string) => void;
}

export const ProfileTabContent = ({
  tabType,
  owner,
  onSettingsPress,
  onPostPress,
  onCommentPress,
}: ProfileTabContentProps) => {
  const { theme } = useUnistyles();

  // About tab - keep existing empty state or implement later
  if (tabType === "about") {
    return <ProfileAboutContent owner={owner} />;
  }

  // Posts and Comments tabs
  const type = tabType === "posts" ? "submissions" : "comments";

  return (
    <ProfilePostsList
      owner={owner}
      type={type}
      onPostPress={onPostPress}
      onCommentPress={onCommentPress}
      ListEmptyComponent={
        <ProfileEmptyState
          tabType={tabType}
          onSettingsPress={onSettingsPress}
        />
      }
    />
  );
};
```

---

### Step 5: Update ProfileScreen

**File**: `src/pages/profile-screen.tsx`

Pass the owner address to tab content and add navigation handlers.

```typescript
// Add navigation handlers
const handlePostPress = useCallback((postId: string) => {
  router.push(`/post/${postId}`);
}, [router]);

const handleCommentPress = useCallback((commentId: string, rootPostId: string) => {
  router.push(`/post/${rootPostId}?highlight=${commentId}`);
}, [router]);

// Update PagerView content
<PagerView ...>
  <View key="posts" style={styles.page}>
    <ProfileTabContent
      tabType="posts"
      owner={user?.walletAddress ?? ""}
      onSettingsPress={handleSettingsPress}
      onPostPress={handlePostPress}
      onCommentPress={handleCommentPress}
    />
  </View>
  <View key="comments" style={styles.page}>
    <ProfileTabContent
      tabType="comments"
      owner={user?.walletAddress ?? ""}
      onSettingsPress={handleSettingsPress}
      onPostPress={handlePostPress}
      onCommentPress={handleCommentPress}
    />
  </View>
  <View key="about" style={styles.page}>
    <ProfileTabContent
      tabType="about"
      owner={user?.walletAddress ?? ""}
      onSettingsPress={handleSettingsPress}
      onPostPress={handlePostPress}
      onCommentPress={handleCommentPress}
    />
  </View>
</PagerView>
```

---

## File Structure

```
src/components/molecules/
├── profile-tabs.tsx              # Update existing
├── profile-post-item.tsx         # NEW
├── profile-comment-item.tsx      # NEW
├── profile-posts-list.tsx        # NEW
├── profile-posts-skeleton.tsx    # NEW (loading state)
└── profile-posts-empty.tsx       # NEW (empty state - extract from profile-tabs)

src/pages/
└── profile-screen.tsx            # Update existing
```

---

## Implementation Checklist

### Phase 1: Core Components
- [x] Create `ProfilePostItem` component
- [x] Create `ProfileCommentItem` component
- [x] Create `ProfilePostsList` component
- [x] Create `ProfilePostsSkeleton` loading component

### Phase 2: Integration
- [x] Update `ProfileTabContent` to use new components
- [x] Update `ProfileScreen` to pass owner and handlers
- [x] Add navigation to post detail from posts list
- [x] Add navigation to comment in post detail from comments list

### Phase 3: Polish
- [x] Add pull-to-refresh functionality
- [x] Add loading more indicator (footer)
- [x] Add error state with retry button
- [x] Test empty states
- [x] Test pagination (infinite scroll)

### Phase 4: Edge Cases
- [x] Handle loading state gracefully
- [x] Handle network errors
- [x] Handle empty responses
- [ ] Test with large datasets
- [x] Verify vote display (user_vote)

---

## Query Keys & Cache

### Query Key Structure
```typescript
queryKeys.userPosts(owner, type)
// ["user", "posts", "mirage1abc...", "submissions"]
// ["user", "posts", "mirage1abc...", "comments"]
```

### Cache Invalidation
Invalidate user posts after:
- Creating a new post
- Creating a new comment
- Deleting a post/comment
- Editing a post/comment

```typescript
// After post mutation
queryClient.invalidateQueries({
  queryKey: queryKeys.userPosts(address, "submissions")
});

// After comment mutation
queryClient.invalidateQueries({
  queryKey: queryKeys.userPosts(address, "comments")
});
```

---

## Design Considerations

### Performance
- Use `useInfiniteUserPosts` for pagination (not `useUserPosts`)
- Implement virtualized list with `FlatList`
- Lazy load thumbnails/images
- Memoize list items with `React.memo`

### UX
- Show skeleton loading on initial fetch
- Show spinner at bottom when loading more
- Pull-to-refresh to reload data
- Smooth scroll with proper `getItemLayout` if items are fixed height

### Accessibility
- Proper touch targets (min 44x44)
- Screen reader labels for vote buttons
- Announce loading states

---

## Testing Scenarios

1. **User with posts**: Verify posts display correctly
2. **User with comments**: Verify comments display with parent context
3. **User with no posts**: Verify empty state shows
4. **User with many posts**: Verify infinite scroll works
5. **Network error**: Verify error state and retry
6. **Pull to refresh**: Verify data reloads
7. **Navigate to post**: Verify post detail opens
8. **Navigate to comment**: Verify scrolls to comment in post detail

---

## Notes

- The `owner` address comes from `useAuthStore` for the current user's profile
- For viewing other users' profiles, pass the profile owner's address
- The `address` parameter in the API call is the viewer's address (for vote data)
- Consider reusing `PostCard` molecule if design is similar enough

---

_Created: January 15, 2026_
