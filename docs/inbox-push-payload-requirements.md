# Inbox Push Payload Requirements

## Purpose

When a user taps an inbox notification in the mobile app, we want to show the new inbox item **immediately**, without waiting for `/get_inbox`.

To make that possible, every push notification for an inbox event must include the same data the Inbox UI needs to render the row exactly as it appears after `/get_inbox` returns.

We do **not** want fallback or approximate text.
We want the **exact same content/context** the Inbox screen would show.

---

## Current backend status

In `mirage-node`, `/api/get_inbox` already returns a unified inbox item shape for all inbox notification types:

- `reply`
- `mention`
- `award`
- `donation`
- `follow`
- `subscription_gift`

That API response already contains the fields needed by the mobile Inbox UI.

However, the current push payloads in `shared/push.py` are too thin:

- `reply`: only sends `type`, `rootPostId`, `replyId`
- `mention`: only sends `type`, `rootPostId`, `replyId`
- `award`: sends `type`, `rootPostId`, `replyId: ""`
- `follow`: sends `type`, `user`
- `donation`: sends `type`, `user`, `amount`
- `subscription_gift`: sends `type`, `user`, `level`

So the app cannot render the exact Inbox row immediately from push payloads today.

---

## Requirement

For **all inbox notification types**, the push payload should include a full `inboxReply` object matching the shape returned by `/api/get_inbox`.

### Ideal payload shape

```json
{
  "type": "reply",
  "rootPostId": "...",
  "replyId": "...",
  "inboxReply": {
    "reply_id": "...",
    "reply_owner": "...",
    "reply_username": "...",
    "reply_content": "...",
    "reply_timestamp": 1234567890,
    "reply_author_level": 0,
    "parent_id": "...",
    "parent_content": "...",
    "parent_owner": "...",
    "root_post_id": "...",
    "type": "reply",
    "award_type": null,
    "amount": null
  }
}
```

---

## What the mobile Inbox UI actually needs

The Inbox row displays:

- actor username
- actor level / styling
- timestamp
- action text (`replied to`, `mentioned you in`, etc.)
- exact parent preview text
- reply body/content when relevant
- award type when relevant
- donation amount when relevant
- stable ids for navigation and dedupe

Because of that, push payloads need to include the exact fields below.

---

## Required fields for all inbox types

These should always be present inside `inboxReply`:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_timestamp`
- `reply_author_level`
- `type`

These are required so the app can:

- identify the item
- render actor info
- show time correctly
- handle navigation / dedupe

---

## Type-specific requirements

### 1. `reply`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_content`
- `reply_timestamp`
- `reply_author_level`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`
- `type`

Why:
- `reply_content` is shown in the Inbox row
- `parent_content` is the exact text shown after `replied to`

---

### 2. `mention`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_content`
- `reply_timestamp`
- `reply_author_level`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`
- `type`

Why:
- `reply_content` is shown in the Inbox row
- `parent_content` is the exact text shown after `mentioned you in`

---

### 3. `award`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_timestamp`
- `reply_author_level`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`
- `type`
- `award_type`

Important:
- `reply_id` must be a **real stable id**, not an empty string
- if the Inbox row should show related content/body, include `reply_content` too

Why:
- `award_type` is needed to render the correct Inbox text/icon
- `parent_content` is needed for exact context

---

### 4. `donation`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_timestamp`
- `reply_author_level`
- `type`
- `amount`

Preferred for shape consistency:

- `reply_content`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`

Important:
- `reply_id` should still exist even if this is backed by a backend event row rather than a post tx hash
- a stable backend event id is fine

---

### 5. `follow`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_timestamp`
- `reply_author_level`
- `type`

Preferred for shape consistency:

- `reply_content`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`

Important:
- `reply_id` should be a stable backend event id

---

### 6. `subscription_gift`

Required:

- `reply_id`
- `reply_owner`
- `reply_username`
- `reply_timestamp`
- `reply_author_level`
- `type`

Preferred for shape consistency:

- `reply_content`
- `parent_id`
- `parent_content`
- `parent_owner`
- `root_post_id`

Important:
- `reply_id` should be a stable backend event id

---

## Critical note about exact rendering

For these notification types:

- `reply`
- `mention`
- `award`

`parent_content` is especially important.

If `parent_content` is missing, the app cannot show the exact text next to:

- `replied to`
- `mentioned you in`
- award context

We do **not** want fallback text like:

- `your post`
- `your comment`

We want the exact same preview text the user would see after `/get_inbox` loads.

---

## Concrete backend gap to fix

Current push payload gaps:

- `reply` and `mention` have `replyId`, but not the full inbox item data
- `award` currently sends `replyId: ""`
- `follow`, `donation`, and `subscription_gift` do not send `replyId`
- none of the push types currently send a full `inboxReply` snapshot

---

## Acceptance criteria

For **every inbox notification type**:

1. user taps notification
2. Inbox opens
3. the new Inbox item appears immediately
4. the item shows the **same exact text/content/context** as `/get_inbox`
5. no pull-to-refresh is needed
6. no fallback text is needed

---

## Recommended implementation

Whenever backend sends a push notification for an inbox event, include:

- `type`
- `rootPostId`
- `replyId`
- `inboxReply` (full `/get_inbox`-compatible object)

This will let mobile render the Inbox item immediately and then seamlessly reconcile when `/get_inbox` returns.
