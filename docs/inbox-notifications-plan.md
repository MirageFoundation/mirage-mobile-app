# Inbox Notifications — Implementation Plan

## Overview

Background job that periodically fetches the user's inbox and sends local push notifications for new/unread replies.

## Libraries

| Package | Purpose | Why |
|---|---|---|
| `expo-notifications` | Local push notifications (+ remote later) | Expo-native, supports both local & remote |
| `expo-task-manager` | Register named background tasks | Required by expo-background-fetch |
| `expo-background-fetch` | Schedule periodic background execution | OS-managed intervals, battery-friendly |

## Constraints

- **Minimum interval**: ~15 minutes (enforced by iOS/Android OS)
- The OS decides actual frequency based on user's app usage patterns
- Background fetch is not guaranteed — it's best-effort
- User must grant notification permissions

## Architecture

```
src/services/inbox-notifications.ts
├── TASK_NAME = "INBOX_NOTIFICATION_CHECK"
├── registerInboxNotificationTask()    — defines the task with TaskManager
├── initInboxNotifications()           — requests permissions + registers BackgroundFetch
├── checkAndNotify()                   — core logic (fetch → diff → notify)
└── Storage keys in MMKV:
    ├── "inbox-notified-ids"           — JSON array of reply_ids already notified
    └── "inbox-last-check-ts"          — timestamp of last successful check
```

## Flow

```
1. App starts → initInboxNotifications() called from RootProvider
2. Request notification permissions (expo-notifications)
3. Register background fetch task (minimum interval: 15 min)
4. Every ~15min (OS-controlled), the task fires:
   a. Read wallet address from MMKV (auth-store persists it)
   b. Call GET /get_inbox?address=<wallet>&limit=50
   c. Load previously-notified reply_ids from MMKV
   d. Filter to only new reply_ids
   e. For each new reply:
      - Schedule immediate local notification via expo-notifications
      - Title: "@{username} replied"
      - Body: truncated reply content
      - Data: { rootPostId, replyId } (for deep linking later)
   f. Save updated notified-ids set to MMKV (keep last 500 to avoid unbounded growth)
   g. Return BackgroundFetch.BackgroundFetchResult.NewData / NoData
```

## MMKV Storage Schema

```typescript
// Key: "inbox-notified-ids"
// Value: JSON string of string[] (reply_id list, max 500)

// Key: "inbox-last-check-ts"  
// Value: string (unix timestamp ms)
```

## app.config.ts Changes

Add to `plugins` array:
- `"expo-notifications"` — no extra config needed for local-only
- Add `UIBackgroundModes: ["fetch", "remote-notification"]` to iOS infoPlist

## Notification Permission Flow

- On first app launch after install, we call `requestPermissionsAsync()`
- If denied, background task still runs but skips notification scheduling
- We don't pester the user — just check `getPermissionsAsync()` silently on subsequent runs

## Deep Linking (Future)

The notification data payload includes `{ rootPostId, replyId }`.
When we add a notification response handler, tapping a notification will navigate to:
`/post/{rootPostId}?highlight={replyId}`

## Files Modified

1. **NEW** `src/services/inbox-notifications.ts` — all logic
2. **EDIT** `app.config.ts` — add plugins + iOS background modes
3. **EDIT** `src/providers/root-provider.tsx` — call init on mount
4. **INSTALL** `expo-notifications`, `expo-task-manager`, `expo-background-fetch`

## Edge Cases

- **User not logged in**: Skip fetch, return NoData
- **Network failure**: Catch error, return Failed, OS will retry later
- **Duplicate notifications**: Prevented by MMKV notified-ids set
- **App in foreground**: expo-notifications can be configured to suppress or show — we'll show as banner
- **MMKV growth**: Cap notified-ids at 500 entries (FIFO eviction)
