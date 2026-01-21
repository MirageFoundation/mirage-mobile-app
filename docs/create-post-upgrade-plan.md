# Create Post Feature Upgrade Plan

> **Summary**: Upgrade the posting feature with improved topic selection, debounced search, create-your-own topic functionality, content warning modal, and Android compatibility fixes.

---

## Overview of Changes

| # | Feature | Priority | Complexity |
|---|---------|----------|------------|
| 1 | Rename "community" to "topic" throughout UI | High | Low |
| 2 | Replace community icon with `#` symbol | High | Low |
| 3 | Add 750ms debounce to topic search | High | Medium |
| 4 | Add "Create new topic" option when topic not found | High | High |
| 5 | Content warning modal (replace tags bottom sheet) | High | High |
| 6 | Handle tag/content warning in post creation | Medium | Low |
| 7 | Topic creation on post submit (not on select) | High | Medium |
| 8 | Android top padding fix in topic list | High | Low |

---

## Current State Analysis

### Files to Modify

1. **`src/pages/create-screen.tsx`** - Main create post screen
2. **`src/pages/create/community-selection-modal.tsx`** - Topic selection modal
3. **`src/stores/draft-store.ts`** - Draft state management
4. **`src/api/read/hooks/use-topics.ts`** - Topic hooks (add debounced version)

### Current Implementation

- Community selection button shows "Select a community" with group icon
- Tags button opens GorhomPopupSheet with placeholder content
- Topic search uses `useSearchTopics` without debounce
- Tags are stored in `draft.tags[]` but not used in post creation
- `ContentTag` type exists: `"" | "sensitive" | "porn" | "gore" | "violence" | "death"`

---

## Implementation Details

### 1. Rename "Community" to "Topic" Throughout UI

**File: `src/pages/create-screen.tsx`**

```tsx
// Change button text
{selectedCommunity?.name ?? "Select a topic"}

// Change comment if any
```

**File: `src/pages/create/community-selection-modal.tsx`**

```tsx
// Change header title from "Post to" to "Select a topic" or keep as is
// Change search placeholder
placeholder="Search for a topic"

// Change empty state message
"No topics found matching your search"
```

### 2. Replace Community Icon with `#` Symbol

**File: `src/pages/create-screen.tsx`**

```tsx
// Replace MaterialCommunityIcons with Text displaying "#"
<Text 
  size="lg" 
  weight="bold" 
  style={{ color: theme.colors.text.default }}
>
  #
</Text>
```

### 3. Add 750ms Debounce to Topic Search

**File: `src/api/read/hooks/use-topics.ts`**

Add a new debounced hook:

```tsx
import { useState, useEffect, useMemo } from "react";

/**
 * Debounced search for topics
 * @param query - Search query
 * @param delay - Debounce delay (default 750ms)
 * @param params - Additional params
 */
export function useDebouncedSearchTopics(
  query: string | undefined | null,
  delay = 750,
  params?: Omit<SearchTopicsParams, "q">
) {
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query?.trim() || "";
    
    if (!trimmedQuery) {
      setDebouncedQuery(null);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, delay);

    return () => clearTimeout(timer);
  }, [query, delay]);

  const searchQuery = useSearchTopics(debouncedQuery, params);

  const isDebouncing = useMemo(() => {
    const trimmedQuery = query?.trim() || "";
    return trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;
  }, [query, debouncedQuery]);

  return {
    ...searchQuery,
    debouncedQuery,
    isDebouncing,
    isSearching: isDebouncing || searchQuery.isFetching,
  };
}
```

**File: `src/pages/create/community-selection-modal.tsx`**

Update to use the debounced hook:

```tsx
// Replace useSearchTopics with useDebouncedSearchTopics
const { 
  data: searchData, 
  isLoading: isSearching,
  isDebouncing 
} = useDebouncedSearchTopics(
  searchText.length >= 2 ? searchText : null,
  750, // 750ms debounce
  { limit: 50 }
);

// Loading state should include debouncing
const isLoading = isLoadingTopics || isDebouncing || isSearching;
```

### 4. Add "Create New Topic" Option

**File: `src/stores/draft-store.ts`**

Update the Community type and draft to track new topics:

```tsx
export type Community = {
  id: string;
  name: string;
  avatar?: string;
  memberCount: number;
  description?: string;
  isSubscribed: boolean;
  isNewTopic?: boolean; // NEW: Flag for topics that don't exist yet
};
```

**File: `src/pages/create/community-selection-modal.tsx`**

Add create topic option when search has no exact match:

```tsx
// Check if exact topic exists
const exactTopicExists = useMemo(() => {
  if (!searchText.trim()) return true;
  const normalizedSearch = searchText.toLowerCase().trim();
  return filteredCommunities.some(
    c => c.id === normalizedSearch || c.name.toLowerCase() === normalizedSearch
  );
}, [searchText, filteredCommunities]);

// Create new topic option
const createTopicOption: Community | null = useMemo(() => {
  if (!searchText.trim() || exactTopicExists) return null;
  const cleanName = searchText.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanName) return null;
  
  return {
    id: cleanName,
    name: cleanName,
    avatar: undefined,
    memberCount: 0,
    description: undefined,
    isSubscribed: false,
    isNewTopic: true,
  };
}, [searchText, exactTopicExists]);

// Render create topic item before the list
{createTopicOption && (
  <CreateTopicItem
    topicName={createTopicOption.name}
    onPress={() => {
      triggerHaptic("selection");
      onSelect(createTopicOption);
    }}
  />
)}
```

New `CreateTopicItem` component:

```tsx
const CreateTopicItem = ({
  topicName,
  onPress,
}: {
  topicName: string;
  onPress: () => void;
}) => {
  const { theme } = useUnistyles();
  
  return (
    <Pressable onPress={onPress} style={styles.createTopicItem}>
      <Box direction="row" alignItems="center" gap="sm" py="md">
        <Feather name="plus" size={20} color={theme.colors.brand[500]} />
        <Text size="lg" weight="semibold" style={{ color: theme.colors.brand[500] }}>
          Create #{topicName}
        </Text>
      </Box>
    </Pressable>
  );
};
```

**File: `src/pages/create-screen.tsx`**

Show warning when new topic is selected:

```tsx
{/* New Topic Warning */}
{selectedCommunity?.isNewTopic && (
  <View style={styles.newTopicWarning}>
    <Text size="xs" mode="subtle" style={{ lineHeight: 16 }}>
      Topics are communities centered around specific interests. 
      Posting in the wrong topic may affect your overall trust status on Mirage. 
      Make sure to post into the right category!
    </Text>
  </View>
)}
```

### 5. Content Warning Modal (Replace Tags Bottom Sheet)

**File: `src/pages/create-screen.tsx`**

Replace the GorhomPopupSheet with a custom content warning modal:

```tsx
// State for content warning
const [showContentWarningModal, setShowContentWarningModal] = useState(false);
const [selectedContentWarning, setSelectedContentWarning] = useState<ContentTag>("");

// Content warning options
const CONTENT_WARNING_OPTIONS: { value: ContentTag; label: string }[] = [
  { value: "sensitive", label: "Sensitive" },
  { value: "porn", label: "Porn" },
  { value: "violence", label: "Violence" },
  { value: "gore", label: "Gore" },
  { value: "death", label: "Death" },
];

// Handler
const handleOpenContentWarning = useCallback(() => {
  triggerHaptic("selection");
  setShowContentWarningModal(true);
}, []);

const handleSelectContentWarning = useCallback((warning: ContentTag) => {
  triggerHaptic("selection");
  setSelectedContentWarning(warning);
  setShowContentWarningModal(false);
}, []);

const handleClearContentWarning = useCallback(() => {
  triggerHaptic("selection");
  setSelectedContentWarning("");
}, []);
```

Replace the tags button:

```tsx
{/* Content Warning Button */}
<Pressable
  onPress={handleOpenContentWarning}
  style={[
    styles.tagsButton,
    { backgroundColor: theme.colors.background.subtle },
  ]}
>
  {selectedContentWarning ? (
    <View style={styles.contentWarningSelected}>
      <Text
        size="sm"
        weight="semibold"
        style={{ color: theme.colors.warning[500] }}
      >
        ⚠️ {selectedContentWarning.charAt(0).toUpperCase() + selectedContentWarning.slice(1)}
      </Text>
      <Pressable 
        onPress={(e) => {
          e.stopPropagation();
          handleClearContentWarning();
        }}
        hitSlop={8}
      >
        <Feather name="x" size={14} color={theme.colors.text.subtle} />
      </Pressable>
    </View>
  ) : (
    <Text
      size="sm"
      weight="semibold"
      style={{ color: theme.colors.text.default }}
    >
      Add content warning (optional)
    </Text>
  )}
</Pressable>
```

Content Warning Modal component:

```tsx
{/* Content Warning Modal */}
<Modal
  visible={showContentWarningModal}
  animationType="fade"
  transparent
  statusBarTranslucent
  onRequestClose={() => setShowContentWarningModal(false)}
>
  <Pressable
    style={styles.modalOverlay}
    onPress={() => setShowContentWarningModal(false)}
  >
    <Pressable 
      style={[
        styles.contentWarningModalContent,
        { backgroundColor: theme.colors.background.base }
      ]}
      onPress={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <View style={styles.contentWarningHeader}>
        <Text size="lg" weight="bold">
          Add content warning
        </Text>
        <Pressable 
          onPress={() => setShowContentWarningModal(false)}
          hitSlop={8}
        >
          <Feather name="x" size={20} color={theme.colors.text.subtle} />
        </Pressable>
      </View>
      
      {/* Options */}
      <View style={styles.contentWarningOptions}>
        {CONTENT_WARNING_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => handleSelectContentWarning(option.value)}
            style={[
              styles.contentWarningOption,
              {
                backgroundColor: selectedContentWarning === option.value
                  ? theme.colors.brand[500] + '20'
                  : theme.colors.background.subtle,
                borderColor: selectedContentWarning === option.value
                  ? theme.colors.brand[500]
                  : 'transparent',
              },
            ]}
          >
            <Text
              size="md"
              weight={selectedContentWarning === option.value ? "semibold" : "regular"}
              style={{
                color: selectedContentWarning === option.value
                  ? theme.colors.brand[500]
                  : theme.colors.text.default,
              }}
            >
              {option.label}
            </Text>
            {selectedContentWarning === option.value && (
              <Feather name="check" size={18} color={theme.colors.brand[500]} />
            )}
          </Pressable>
        ))}
      </View>
      
      {/* Clear button if selected */}
      {selectedContentWarning && (
        <Pressable
          onPress={() => {
            setSelectedContentWarning("");
            setShowContentWarningModal(false);
          }}
          style={styles.clearWarningButton}
        >
          <Text size="sm" style={{ color: theme.colors.error[500] }}>
            Remove warning
          </Text>
        </Pressable>
      )}
    </Pressable>
  </Pressable>
</Modal>
```

Styles to add:

```tsx
modalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: theme.spacing.lg,
},
contentWarningModalContent: {
  width: '100%',
  maxWidth: 340,
  borderRadius: theme.radius.xl,
  padding: theme.spacing.lg,
},
contentWarningHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing.lg,
},
contentWarningOptions: {
  gap: theme.spacing.sm,
},
contentWarningOption: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: theme.spacing.md,
  paddingHorizontal: theme.spacing.md,
  borderRadius: theme.radius.lg,
  borderWidth: 1.5,
},
clearWarningButton: {
  alignItems: 'center',
  marginTop: theme.spacing.lg,
  paddingVertical: theme.spacing.sm,
},
contentWarningSelected: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: theme.spacing.sm,
},
newTopicWarning: {
  paddingHorizontal: theme.spacing.md,
  paddingVertical: theme.spacing.sm,
  backgroundColor: theme.colors.warning[500] + '15',
  borderRadius: theme.radius.md,
  marginTop: theme.spacing.sm,
},
```

### 6. Handle Tag/Content Warning in Post Creation

**File: `src/pages/create-screen.tsx`**

Update `handlePost` to use the selected content warning:

```tsx
const postInput: CreatePostMutationInput = {
  topic,
  title: draft.title.trim(),
  content: content,
  tag: selectedContentWarning, // Use the selected content warning
  optimisticMediaUrl: imageUrl ?? undefined,
};
```

### 7. Topic Creation on Post Submit

Topics are auto-created when you post to them - no separate API call needed. The backend creates the topic automatically if it doesn't exist when you submit a post with that topic name.

**Verification from API docs (`docs/api-plans/03-write-api-plan.md`):**

```typescript
// MsgPost canonical tags include:
// - 101: `topic` (string, required for post)
// The topic is just a string - backend creates it if it doesn't exist
```

**No additional API implementation needed** - just ensure the topic name is passed correctly to the post endpoint.

The flow:
1. User searches for topic → not found → clicks "Create #topicxyz"
2. Topic is marked as `isNewTopic: true` in draft
3. Warning message shows below selector
4. User clicks Post
5. Post is submitted with `topic: "topicxyz"`
6. Backend creates topic if it doesn't exist, creates post
7. Topic list is invalidated on success for future searches

**File: `src/api/write/hooks/use-post.ts`**

Add topic cache invalidation on successful post:

```tsx
onSuccess: (data, input) => {
  // ... existing code ...
  
  // Invalidate topics cache to include newly created topics
  queryClient.invalidateQueries({ 
    queryKey: ["topics"],
    refetchType: "inactive",
  });
  queryClient.invalidateQueries({ 
    queryKey: ["searchTopics"],
    refetchType: "inactive",
  });
},
```

### 8. Android Top Padding Fix in Topic List

**File: `src/pages/create/community-selection-modal.tsx`**

Add safe area insets for Android:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";

// Inside component:
const insets = useSafeAreaInsets();

// Apply top padding for Android
<Box
  style={[
    styles.container,
    {
      backgroundColor: theme.colors.background.default,
      paddingTop: Platform.OS === 'android' ? insets.top : 0,
    },
  ]}
>
```

---

## Implementation Order

### Phase 1: Quick Wins (1-2 hours)
1. [ ] Rename "community" to "topic" in UI text
2. [ ] Replace community icon with `#` symbol
3. [ ] Fix Android top padding in topic list

### Phase 2: Search & Debounce (1-2 hours)
4. [ ] Add `useDebouncedSearchTopics` hook
5. [ ] Integrate debounced search in topic selection modal

### Phase 3: Content Warning Modal (2-3 hours)
6. [ ] Remove GorhomPopupSheet for tags
7. [ ] Create content warning modal UI
8. [ ] Handle content warning selection/display on button
9. [ ] Pass tag to post creation

### Phase 4: Create Topic Feature (2-3 hours)
10. [ ] Update Community type with `isNewTopic` flag
11. [ ] Add create topic UI in search results
12. [ ] Show warning message for new topics
13. [ ] Invalidate topic cache on post success

---

## Testing Checklist

- [ ] "Select a topic" button shows `#` icon instead of group icon
- [ ] Button text says "Select a topic" when no topic selected
- [ ] Topic search has 750ms debounce (no API call while typing)
- [ ] When searching for non-existent topic, "Create #xyz" option appears
- [ ] Selecting "Create #xyz" shows topic on button + warning message
- [ ] Warning message shows below topic button for new topics
- [ ] "Add content warning" button opens modal (not bottom sheet)
- [ ] Modal shows 5 options: Sensitive, Porn, Violence, Gore, Death
- [ ] Selecting option closes modal and shows on button
- [ ] Can reopen modal and change/clear selection
- [ ] Content warning is passed to API when posting
- [ ] Topic list has proper padding on Android
- [ ] New topics appear in search results after posting

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/pages/create-screen.tsx` | Icon change, text change, content warning modal, new topic warning |
| `src/pages/create/community-selection-modal.tsx` | Text change, debounced search, create topic option, Android padding |
| `src/api/read/hooks/use-topics.ts` | Add `useDebouncedSearchTopics` hook |
| `src/stores/draft-store.ts` | Add `isNewTopic` flag to Community type |
| `src/api/write/hooks/use-post.ts` | Invalidate topics cache on success |

---

## Notes

- **No new API endpoints needed** - Topics are auto-created by backend when posting
- **Content tags already supported** - `ContentTag` type exists in `src/api/write/endpoints/posts.ts`
- **Debounce pattern exists** - Can follow `src/api/read/hooks/use-debounced-search.ts`
- **GorhomPopupSheet** can be removed from create-screen imports after migration
