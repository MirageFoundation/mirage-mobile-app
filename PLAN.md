# Mirage App - Development Plan

> **Tech Stack**: Expo (v54) | React Native | Bun | Unistyles v3 | Expo Router v6 | Gorhom Bottom Sheet

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Route Structure (Expo Router)](#2-route-structure-expo-router)
3. [Component Architecture](#3-component-architecture)
4. [Page Layouts (ASCII)](#4-page-layouts-ascii)
5. [Detailed Component Breakdown](#5-detailed-component-breakdown)
6. [Authentication Flow](#6-authentication-flow)
7. [State Management & Caching](#7-state-management--caching-strategy)
8. [Technical Considerations](#8-technical-considerations)
9. [Implementation Phases](#9-implementation-phases)

---

## 1. Project Overview

### App Tabs

```
┌─────────────────────────────────────────────────────────────┐
│   Home  │  Following  │  Create  │  Inbox  │  Profile      │
└─────────────────────────────────────────────────────────────┘
```

### User Access Matrix

| Feature           | Guest User | Logged-in User |
| ----------------- | ---------- | -------------- |
| Home (view posts) | ✅         | ✅             |
| Following         | ✅ (empty) | ✅             |
| Create Post       | ❌ (sheet) | ✅             |
| Profile           | ❌ (sheet) | ✅             |
| Inbox             | ❌ (sheet) | ✅             |
| Like/Comment      | ❌ (sheet) | ✅             |

---

## 2. Route Structure (Expo Router)

### Directory Structure

```
app/
├── _layout.tsx                    # Root layout (providers, stack)
├── (tabs)/                        # Tab group layout
│   ├── _layout.tsx                # Tab navigator layout
│   ├── index.tsx                  # Home tab
│   ├── following.tsx              # Following tab
│   ├── create.tsx                 # Create tab
│   ├── inbox.tsx                  # Inbox tab
│   └── profile.tsx                # Profile tab
├── post/
│   └── [id].tsx                   # Post detail with comments
├── (auth)/                        # Auth flow (modal group)
│   ├── _layout.tsx                # Auth modal layout
│   ├── username.tsx               # Username selection
│   ├── recovery-phrase.tsx        # Show 12-word phrase
│   └── login.tsx                  # Enter recovery phrase
└── +not-found.tsx                 # 404 page
```

### Tab Navigator Layout (`app/(tabs)/_layout.tsx`)

```tsx
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { /* animated visibility */ },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ... }} />
      <Tabs.Screen name="following" options={{ title: 'Following', tabBarIcon: ... }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarIcon: ... }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: ... }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ... }} />
    </Tabs>
  );
}
```

---

## 3. Component Architecture

### Atomic Design Structure

```
src/components/
├── atoms/                         # Fundamental building blocks
│   ├── index.ts
│   ├── avatar.tsx                 # User avatar
│   ├── icon-button.tsx            # Tappable icon
│   ├── badge.tsx                  # Notification/count badge
│   ├── time-ago.tsx               # Relative timestamp
│   ├── follow-button.tsx          # Follow/unfollow button
│   ├── vote-button.tsx            # Like/dislike button
│   ├── content-warning-badge.tsx  # NSFW/Warning indicator
│   ├── topic-chip.tsx             # Topic/category chip
│   ├── word-chip.tsx              # Recovery phrase word chip
│   ├── status-step.tsx            # Onboarding status step
│   └── media-thumbnail.tsx        # Image/video thumbnail
│
├── molecules/                     # Composite components
│   ├── index.ts
│   ├── post-card.tsx              # Full post display
│   ├── post-actions.tsx           # Like/dislike/comment/share bar
│   ├── comment-item.tsx           # Single comment with thread
│   ├── comment-thread.tsx         # Collapsible thread
│   ├── comment-input.tsx          # Comment text input
│   ├── auth-sheet.tsx             # Account creation/login bottom sheet
│   ├── feed-header.tsx            # Top bar with options/title/search
│   ├── topic-selector.tsx         # Topic dropdown/modal
│   ├── content-warning-selector.tsx # Warning type selection
│   ├── media-picker-bar.tsx       # Link/image/video/poll icons
│   ├── recovery-phrase-grid.tsx   # 12-word display grid
│   ├── recovery-phrase-input.tsx  # 12-word input grid
│   ├── onboarding-progress.tsx    # Status with timing display
│   ├── profile-header.tsx         # User profile info section
│   ├── profile-stats.tsx          # Balance/reserve/tier stats
│   ├── adult-content-popup.tsx    # Adult content preference popup
│   └── comment-options-sheet.tsx  # Comment more options sheet
│
├── pages/                         # Full page compositions
│   ├── index.ts
│   ├── home-page.tsx              # Home feed page
│   ├── following-page.tsx         # Following feed page
│   ├── create-page.tsx            # Post creation page
│   ├── inbox-page.tsx             # Inbox page (placeholder)
│   ├── profile-page.tsx           # User profile page
│   ├── post-detail-page.tsx       # Single post with comments
│   ├── username-page.tsx          # Username selection page
│   ├── recovery-phrase-page.tsx   # Recovery phrase display page
│   └── login-page.tsx             # Login with phrase page
│
└── ui/                            # (Existing) Shared UI utilities
    └── primitives/                # Base primitives (Box, Text, Button, etc.)
```

---

## 4. Page Layouts (ASCII)

### 4.1 Home Page

```
┌────────────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░ HEADER (Animated) ░░░░░░░░░░░░░░░░░░░░░░░ │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ☰  │           "Popular"  ▼            │       🔍        │ │
│ │     │         (feed switcher)           │     (search)    │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ ┌──────┐  @username              3h ago    ┌──────────┐   │ │
│ │ │Avatar│  Topic: Technology               │  Follow  │   │ │
│ │ └──────┘                                   └──────────┘   │ │
│ │                                                            │ │
│ │  Post title goes here...                                   │ │
│ │                                                            │ │
│ │  ┌────────────────────────────────────────────────────┐   │ │
│ │  │                                                    │   │ │
│ │  │              [Post Image/Media]                    │   │ │
│ │  │                                                    │   │ │
│ │  └────────────────────────────────────────────────────┘   │ │
│ │                                                            │ │
│ │  Post body text content goes here if any...                │ │
│ │                                                            │ │
│ │  ┌──────────────────────────────────────────────────────┐ │ │
│ │  │  👍 123   👎 12   │   💬 45   │   🔗 Share         │ │ │
│ │  └──────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │                     [Another Post Card]                    │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│                            ...                                 │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░ TAB BAR (Animated) ░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │   🏠      👥       ✚        📥       👤                   │ │
│ │  Home  Following  Create   Inbox   Profile                 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Post Detail Page (with Comments)

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │              Post                  │                 │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  [Full Post Content]                     │  │
│  │                    (same as card)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ─────────────────── Comments (45) ───────────────────────     │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ┌────┐  @commenter1                        2h ago        │  │
│  │ │ Av │  This is a comment text...                        │  │
│  │ └────┘                                                    │  │
│  │         👍 12   👎 2   💬 Reply   ⋯ More                 │  │
│  │                                                           │  │
│  │    ┌────────────────────────────────────────────────┐    │  │
│  │    │  ▼ Thread (3 replies) ──────────────────────   │    │  │
│  │    │                                                │    │  │
│  │    │  ┌────┐  @replier1              1h ago        │    │  │
│  │    │  │ Av │  Reply to the comment...              │    │  │
│  │    │  └────┘                                        │    │  │
│  │    │           👍 5   👎 0   💬 Reply              │    │  │
│  │    │                                                │    │  │
│  │    │  ┌────┐  @replier2              30m ago       │    │  │
│  │    │  │ Av │  Another reply here...                │    │  │
│  │    │  └────┘                                        │    │  │
│  │    └────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ┌────┐  @commenter2                        5h ago        │  │
│  │ │ Av │  Another top-level comment...                     │  │
│  │ └────┘                                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ┌────────────────────────────────────────────┐  ┌──────┐ │ │
│ │  │  Write a comment...                        │  │ Send │ │ │
│ │  └────────────────────────────────────────────┘  └──────┘ │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.3 Create Post Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  Cancel  │       Create Post        │         Post         │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📁 Select Topic                                    ▼    │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │    Technology  •  News  •  Gaming  •  Music  •  ...      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Title *                                                 │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Enter your post title...                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Body (optional)                                         │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │  Write your post content here...                         │  │
│  │                                                          │  │
│  │                                                          │  │
│  │                                                          │  │
│  │                                                   120    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ☐ Content Warning                                       │  │
│  │                                                          │  │
│  │     (when checked, shows:)                               │  │
│  │     ☐ Sensitive    ☐ Adult/NSFW                         │  │
│  │     ☐ Violence     ☐ Gore                                │  │
│  │     ☐ Death                                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [Attached Media Preview]                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐ │
│ │   🔗      🖼️       🎬       📊       •••                  │ │
│ │  Link   Image    Video    Poll   Bullet                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │          [ Discard ]           [ Save Draft ]              │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.4 Profile Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ☰  │            Profile              │        ⚙️          │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                                                  │       │
│     │              ┌───────────┐                       │       │
│     │              │           │                       │       │
│     │              │  Avatar   │                       │       │
│     │              │   (80)    │                       │       │
│     │              │           │                       │       │
│     │              └───────────┘                       │       │
│     │                                                  │       │
│     │              @username                           │       │
│     │              Tier: Premium                       │       │
│     │                                                  │       │
│     │   ┌────────────────────────────────────────┐    │       │
│     │   │  0x1234...abcd                   📋    │    │       │
│     │   └────────────────────────────────────────┘    │       │
│     │                                                  │       │
│     │   Joined: Dec 2024                              │       │
│     │                                                  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │       │
│     │  │ Balance  │  │ Reserve  │  │  Posts   │       │       │
│     │  │  1,234   │  │   500    │  │   42     │       │       │
│     │  └──────────┘  └──────────┘  └──────────┘       │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │   Posts   │   Comments   │   About              │       │
│     ├──────────────────────────────────────────────────┤       │
│     │                                                  │       │
│     │   [User's posts/comments/about content]          │       │
│     │                                                  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────┐ │
│ │   🏠      👥       ✚        📥       👤                   │ │
│ │  Home  Following  Create   Inbox   Profile                 │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.5 Auth Bottom Sheet

```
┌────────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░ Blurred Background ░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                        ─────                           │    │
│  │                                                   ✕    │    │
│  │                                                        │    │
│  │              Welcome to Mirage                         │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  🔑  Create New Account                        │   │    │
│  │   │      Set up your identity                      │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  📝  Login with Recovery Phrase                │   │    │
│  │   │      I already have an account                 │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### 4.6 Username Selection Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │         Create Account         │                     │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│                    Choose your username                        │
│                                                                │
│        This will be your identity on Mirage                    │
│                                                                │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │  @                                               │       │
│     │  ─────────────────────────────────────────────   │       │
│     │  username                                        │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
│              ✓ Username is available                           │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                   Continue                        │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.7 Recovery Phrase Display Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │        Recovery Phrase          │                    │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│          🔐 Save Your Recovery Phrase                          │
│                                                                │
│   ⚠️  Write down these 12 words in order.                      │
│       This is the ONLY way to recover your account.            │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │ 1.word  │ │ 2.word  │ │ 3.word  │ │ 4.word  │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │ 5.word  │ │ 6.word  │ │ 7.word  │ │ 8.word  │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │ 9.word  │ │10.word  │ │11.word  │ │12.word  │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │                   [ 📋 Copy All ]                      │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│      ☐ I have saved my recovery phrase securely                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                   Continue                        │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.8 Onboarding Progress (Status Display)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ░░░ Fetching transaction parameters... (2.3s)       ░░░ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│                        Creating Account                        │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                                                  │       │
│     │   ✅  Preparing                          1.2s    │       │
│     │       ────────────────────────────────────────   │       │
│     │                                                  │       │
│     │   🔄  Submitting                         3.4s    │       │
│     │       ██████████████░░░░░░░░░░░░░░░░░░░░░░░░    │       │
│     │                                                  │       │
│     │   ⏳  Verifying                          ─.─s    │       │
│     │       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │       │
│     │                                                  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
│               Performing PoW for single tx...                  │
│                        (5.2s)                                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 4.9 Comment More Options Sheet

```
┌────────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░ Blurred Background ░░░░░░░░░░░░░░░░░░░░  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                        ─────                      ✕    │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  💾  Save Comment                              │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  📋  Copy Text                                 │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  👤  Unfollow @username                        │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  ↕️  Collapse Comment                          │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  │   ┌────────────────────────────────────────────────┐   │    │
│  │   │  🗑️  Delete (own comment only)                 │   │    │
│  │   └────────────────────────────────────────────────┘   │    │
│  │                                                        │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### 4.10 Adult Content Popup

```
┌────────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░ Blurred Background ░░░░░░░░░░░░░░░░░░░░  │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                                                  │       │
│     │              🔞 Adult Content                    │       │
│     │                                                  │       │
│     │    Would you like to enable adult content        │       │
│     │    in your feed?                                 │       │
│     │                                                  │       │
│     │    You can change this later in settings.        │       │
│     │                                                  │       │
│     │  ┌────────────────────────────────────────────┐  │       │
│     │  │              Yes, Enable                   │  │       │
│     │  └────────────────────────────────────────────┘  │       │
│     │                                                  │       │
│     │  ┌────────────────────────────────────────────┐  │       │
│     │  │               No Thanks                    │  │       │
│     │  └────────────────────────────────────────────┘  │       │
│     │                                                  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 5. Detailed Component Breakdown

### 5.1 Atoms

| Component             | Props                                         | Description                        |
| --------------------- | --------------------------------------------- | ---------------------------------- |
| `Avatar`              | `size`, `seed`, `source`, `rounded`           | User avatar using DiceBear         |
| `IconButton`          | `icon`, `iconName`, `onPress`, `size`, `mode` | Tappable icon (like/share/etc)     |
| `Badge`               | `count`, `mode`, `size`                       | Notification count badge           |
| `TimeAgo`             | `timestamp`, `size`                           | Relative time display (3h ago)     |
| `FollowButton`        | `isFollowing`, `onPress`, `size`              | Follow/unfollow toggle button      |
| `VoteButton`          | `type`, `count`, `isActive`, `onPress`        | Like/dislike button with count     |
| `ContentWarningBadge` | `types[]`                                     | NSFW/Violence/etc warning pill     |
| `TopicChip`           | `topic`, `onPress`, `selected`                | Topic/category selector chip       |
| `WordChip`            | `word`, `index`, `editable`, `onChangeText`   | Single recovery word display/input |
| `StatusStep`          | `label`, `status`, `duration`                 | Onboarding step indicator          |
| `MediaThumbnail`      | `uri`, `type`, `onRemove`                     | Image/video preview thumbnail      |

### 5.2 Molecules

| Component                | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `PostCard`               | Full post with header, content, media, actions |
| `PostActions`            | Like/dislike/comment/share action bar          |
| `CommentItem`            | Single comment with avatar, text, actions      |
| `CommentThread`          | Collapsible nested replies                     |
| `CommentInput`           | Text input with send button                    |
| `AuthSheet`              | Bottom sheet for auth options                  |
| `FeedHeader`             | Animated header with options/title/search      |
| `TopicSelector`          | Topic selection dropdown/grid                  |
| `ContentWarningSelector` | Warning type checkboxes                        |
| `MediaPickerBar`         | Link/image/video/poll icon buttons             |
| `RecoveryPhraseGrid`     | 4x3 grid displaying 12 words                   |
| `RecoveryPhraseInput`    | 4x3 grid for entering 12 words                 |
| `OnboardingProgress`     | Multi-step status with timing                  |
| `ProfileHeader`          | Avatar + username + tier section               |
| `ProfileStats`           | Balance/reserve/posts stat cards               |
| `AdultContentPopup`      | Yes/No adult content modal                     |
| `CommentOptionsSheet`    | More options bottom sheet                      |

### 5.3 Pages

| Page                 | Route                     | Description          |
| -------------------- | ------------------------- | -------------------- |
| `HomePage`           | `/(tabs)/`                | Main feed with posts |
| `FollowingPage`      | `/(tabs)/following`       | Following feed       |
| `CreatePage`         | `/(tabs)/create`          | Post creation form   |
| `InboxPage`          | `/(tabs)/inbox`           | Placeholder page     |
| `ProfilePage`        | `/(tabs)/profile`         | User profile         |
| `PostDetailPage`     | `/post/[id]`              | Post with comments   |
| `UsernamePage`       | `/(auth)/username`        | Username selection   |
| `RecoveryPhrasePage` | `/(auth)/recovery-phrase` | Phrase display       |
| `LoginPage`          | `/(auth)/login`           | Phrase input login   |

---

## 6. Authentication Flow

### Account Creation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Auth Sheet    │────▶│  Username Page  │────▶│ Recovery Phrase │
│  (Create New)   │     │ (enter username)│     │  (show 12 words)│
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Home Page     │◀────│  Adult Content  │◀────│  Onboarding     │
│  (logged in)    │     │   Popup (Y/N)   │     │   Progress      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Login Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Auth Sheet    │────▶│   Login Page    │────▶│   Onboarding    │
│    (Login)      │     │ (enter 12 words)│     │    Progress     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │   Home Page     │
                                                │  (logged in)    │
                                                └─────────────────┘
```

### Onboarding Status States

```typescript
type OnboardingStatus =
  | { step: "preparing"; duration: number }
  | { step: "submitting"; duration: number }
  | { step: "verifying"; duration: number }
  | { step: "complete" };

type SonnerStatus =
  | "fetching_params"
  | "performing_pow"
  | "broadcasting"
  | "submitted";
```

---

## 7. State Management & Caching Strategy

### 7.0 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    State Management (Simplified)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    TanStack Query (Server State)                 │   │
│  │  • Posts, Comments, User profiles                               │   │
│  │  • Auto caching & background refetch                            │   │
│  │  • Optimistic updates (likes, follows)                          │   │
│  │  • Infinite scroll pagination                                    │   │
│  │  • Already installed & configured ✓                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│                                  ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Zustand (Client State)                       │   │
│  │  • Auth state (user, isLoggedIn, recoveryPhrase)                │   │
│  │  • UI preferences (theme, adultContent, feedType)               │   │
│  │  • Post drafts (title, body, topic, media)                      │   │
│  │  • UI state (modals, sheets visibility)                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                  │                                      │
│                                  ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MMKV (Persistent Storage)                     │   │
│  │  • Zustand persist middleware                                   │   │
│  │  • TanStack Query cache persistence (optional)                  │   │
│  │  • Synchronous reads (no await needed)                          │   │
│  │  • 10x faster than AsyncStorage                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ❌ No SQLite/Drizzle needed - Zustand + MMKV handles everything!      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

> **Why no SQLite?** For a social feed app, TanStack Query's in-memory cache + MMKV persistence is plenty. SQLite adds complexity without benefit unless you need complex offline queries or relational data.

### 7.0.1 Package Installation

```bash
# Zustand for client state
bun add zustand

# MMKV for fast persistent storage
bun add react-native-mmkv
```

> **That's it!** TanStack Query is already installed. No other dependencies needed.

### 7.0.2 Zustand Store Structure

```
src/stores/
├── index.ts                    # Export all stores
├── auth-store.ts               # Authentication state
├── preferences-store.ts        # User preferences
├── draft-store.ts              # Post draft state
└── ui-store.ts                 # UI state (modals, sheets)
```

#### Auth Store Example

```typescript
// src/stores/auth-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

type User = {
  id: string;
  username: string;
  walletAddress: string;
  tier: string;
};

type AuthState = {
  user: User | null;
  isLoggedIn: boolean;
  recoveryPhrase: string | null;

  // Actions
  setUser: (user: User) => void;
  setRecoveryPhrase: (phrase: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoggedIn: false,
      recoveryPhrase: null,

      setUser: (user) => set({ user, isLoggedIn: true }),
      setRecoveryPhrase: (phrase) => set({ recoveryPhrase: phrase }),
      logout: () =>
        set({ user: null, isLoggedIn: false, recoveryPhrase: null }),
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

#### Preferences Store Example

```typescript
// src/stores/preferences-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

type PreferencesState = {
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  feedType: "home" | "popular" | "news";

  // Actions
  setAdultContent: (enabled: boolean) => void;
  setHasSeenAdultPrompt: () => void;
  setFeedType: (type: "home" | "popular" | "news") => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      adultContentEnabled: false,
      hasSeenAdultPrompt: false,
      feedType: "home",

      setAdultContent: (enabled) => set({ adultContentEnabled: enabled }),
      setHasSeenAdultPrompt: () => set({ hasSeenAdultPrompt: true }),
      setFeedType: (type) => set({ feedType: type }),
    }),
    {
      name: "preferences-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

#### Draft Store Example

```typescript
// src/stores/draft-store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "./mmkv-storage";

type PostDraft = {
  topic: string | null;
  title: string;
  body: string;
  contentWarning: string[];
  mediaUris: string[];
};

type DraftState = {
  draft: PostDraft;
  hasDraft: boolean;

  // Actions
  updateDraft: (partial: Partial<PostDraft>) => void;
  clearDraft: () => void;
};

const emptyDraft: PostDraft = {
  topic: null,
  title: "",
  body: "",
  contentWarning: [],
  mediaUris: [],
};

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      draft: emptyDraft,
      hasDraft: false,

      updateDraft: (partial) =>
        set((state) => ({
          draft: { ...state.draft, ...partial },
          hasDraft: true,
        })),
      clearDraft: () => set({ draft: emptyDraft, hasDraft: false }),
    }),
    {
      name: "draft-storage",
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

#### UI Store (Non-Persisted)

```typescript
// src/stores/ui-store.ts
import { create } from "zustand";

type UIState = {
  authSheetVisible: boolean;
  commentOptionsPostId: string | null;

  // Actions
  showAuthSheet: () => void;
  hideAuthSheet: () => void;
  showCommentOptions: (postId: string) => void;
  hideCommentOptions: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  authSheetVisible: false,
  commentOptionsPostId: null,

  showAuthSheet: () => set({ authSheetVisible: true }),
  hideAuthSheet: () => set({ authSheetVisible: false }),
  showCommentOptions: (postId) => set({ commentOptionsPostId: postId }),
  hideCommentOptions: () => set({ commentOptionsPostId: null }),
}));
```

### 7.0.3 MMKV Storage Adapter

```typescript
// src/stores/mmkv-storage.ts
import { MMKV } from "react-native-mmkv";
import { StateStorage } from "zustand/middleware";

export const storage = new MMKV();

export const mmkvStorage: StateStorage = {
  getItem: (name) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name, value) => {
    storage.set(name, value);
  },
  removeItem: (name) => {
    storage.delete(name);
  },
};
```

### 7.0.4 TanStack Query (Already Configured ✓)

Your existing query provider in `src/providers/query-provider.tsx` works perfectly!

TanStack Query automatically:

- Caches all API responses in memory
- Dedupes identical requests
- Background refetches stale data
- Handles loading/error states

```typescript
// Example usage in components
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/services/query-keys";

// Fetch posts (auto-cached)
const { data: posts, isLoading } = useQuery({
  queryKey: queryKeys.posts.feed("home"),
  queryFn: () => fetchPosts("home"),
  staleTime: 1000 * 60, // Consider fresh for 1 minute
});

// Optimistic like mutation
const queryClient = useQueryClient();
const likeMutation = useMutation({
  mutationFn: (postId: string) => likePost(postId),
  onMutate: async (postId) => {
    // Optimistically update the cache
    await queryClient.cancelQueries({ queryKey: queryKeys.posts.feed("home") });
    // ... optimistic update logic
  },
});
```

> **Note:** If you need offline persistence later, you can add `@tanstack/query-async-storage-persister` and persist to MMKV. Not needed for initial UI development.

### 7.0.5 Query Keys Structure

```typescript
// src/services/query-keys.ts
export const queryKeys = {
  posts: {
    all: ["posts"] as const,
    feed: (type: string) => ["posts", "feed", type] as const,
    following: ["posts", "following"] as const,
    detail: (id: string) => ["posts", "detail", id] as const,
    user: (userId: string) => ["posts", "user", userId] as const,
  },
  comments: {
    all: ["comments"] as const,
    byPost: (postId: string) => ["comments", "post", postId] as const,
  },
  users: {
    current: ["users", "current"] as const,
    profile: (id: string) => ["users", "profile", id] as const,
  },
};
```

### 7.0.6 State Usage Summary

| State Type     | Store                 | Persisted   | Example Data                               |
| -------------- | --------------------- | ----------- | ------------------------------------------ |
| User session   | `useAuthStore`        | ✅ MMKV     | `user`, `isLoggedIn`, `recoveryPhrase`     |
| Preferences    | `usePreferencesStore` | ✅ MMKV     | `adultContent`, `feedType`, `theme`        |
| Post drafts    | `useDraftStore`       | ✅ MMKV     | `title`, `body`, `topic`, `mediaUris`      |
| UI state       | `useUIStore`          | ❌ Memory   | `authSheetVisible`, `commentOptionsPostId` |
| Posts/Comments | TanStack Query        | ✅ Memory\* | Server data with auto-caching              |

> **\*TanStack Query** caches in memory by default. Can optionally persist to MMKV for offline support later if needed.

---

## 8. Technical Considerations

### 8.1 Scroll-based Header/Tab Bar Animation

```typescript
// Use Reanimated shared value for scroll position
const scrollY = useSharedValue(0);
const lastScrollY = useSharedValue(0);
const headerTranslateY = useSharedValue(0);
const tabBarTranslateY = useSharedValue(0);

// Scroll handler
const onScroll = useAnimatedScrollHandler({
  onScroll: (event) => {
    const diff = event.contentOffset.y - lastScrollY.value;

    if (diff > 0 && event.contentOffset.y > 50) {
      // Scrolling down - hide
      headerTranslateY.value = withTiming(-HEADER_HEIGHT);
      tabBarTranslateY.value = withTiming(TAB_BAR_HEIGHT);
    } else if (diff < 0) {
      // Scrolling up - show
      headerTranslateY.value = withTiming(0);
      tabBarTranslateY.value = withTiming(0);
    }

    lastScrollY.value = event.contentOffset.y;
  },
});
```

### 8.2 Bottom Sheet Integration

Using `@gorhom/bottom-sheet` (already installed):

```typescript
import BottomSheet from "@gorhom/bottom-sheet";

const AuthSheet = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%"], []);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      backdropComponent={CustomBackdrop}
    >
      {/* Auth options */}
    </BottomSheet>
  );
};
```

### 8.3 Existing Primitives Reference

| Primitive     | Key Props                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `Box`         | `p`, `px`, `py`, `m`, `gap`, `direction`, `rounded`, `background`, `flex`, `center`, `safeArea`, `animation` |
| `Text`        | `size` (xs-tera), `weight`, `mode`, `leading`                                                                |
| `Button`      | `size`, `variant` (outline/ghost), `mode`, `rounded`, `loading`, `haptics`                                   |
| `Button.Text` | Inherits button context                                                                                      |
| `Button.Icon` | Renders icon with proper size/color                                                                          |
| `Input`       | `size`, `variant`, `mode`, `leftAccessory`, `rightAccessory`                                                 |
| `TextArea`    | Extends Box + TextInput, `maxLength` counter                                                                 |
| `Checkbox`    | `size`, `mode`, `checked`, `onChange`                                                                        |
| `Switch`      | `value`, `onPress`, `size`, `mode`                                                                           |
| `Divider`     | `direction`, `size`, `variant`, `color`                                                                      |
| `Icon`        | `icon`, `name`, `size`, `color`, `mode`                                                                      |
| `ProgressBar` | `progress`, `size`, `mode`, `variant`, `animated`                                                            |

### 8.4 Auth Guard Hook

```typescript
// src/hooks/use-auth-guard.ts
import { useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";

export const useAuthGuard = () => {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const showAuthSheet = useUIStore((s) => s.showAuthSheet);

  const requireAuth = useCallback(
    (action: () => void) => {
      if (isLoggedIn) {
        action();
      } else {
        showAuthSheet();
      }
    },
    [isLoggedIn, showAuthSheet]
  );

  return { requireAuth, isLoggedIn };
};

// Usage in components:
const { requireAuth } = useAuthGuard();

const handleLike = () => {
  requireAuth(() => {
    // Like action - only runs if logged in
    likePost(postId);
  });
};
```

### 8.5 Theme Colors Reference

```typescript
// From src/config/theme.ts
colors: {
  primary, brand, secondary, success, warning, error, neutral,
  text: { default, subtle },
  background: { default, dim, plain, subtle, emphasis, light, lighter, lightest, dark, darker, darkest },
  border: { default, subtle, strong }
}
```

---

## 9. Implementation Phases

### Phase 1: Core Infrastructure (Week 1) ✅

- [x] Set up tab navigation with Expo Router
- [x] Install & configure Zustand + MMKV
- [x] Create store structure (auth, preferences, draft, ui)
- [x] Create animated header/tab bar system
- [x] Implement auth guard hook
- [x] Create auth bottom sheet molecule

### Phase 2: Atoms (Week 1-2) ✅

- [x] Avatar atom
- [x] IconButton atom
- [x] VoteButton atom
- [x] FollowButton atom
- [x] TimeAgo atom
- [x] Badge atom
- [x] TopicChip atom
- [x] WordChip atom
- [x] StatusStep atom
- [x] ContentWarningBadge atom
- [x] MediaThumbnail atom

### Phase 3: Feed Molecules (Week 2) ✅

- [x] PostCard molecule
- [x] PostActions molecule
- [x] FeedHeader molecule

### Phase 4: Home & Following Pages (Week 2-3) ✅

- [x] HomePage with feed (mock data, auth-guarded actions, optimistic updates)
- [x] FollowingPage (guest state, logged-in feed, empty state)
- [x] Scroll-based header animation
- [x] PostCard UI refinements (compact layout, more button, smaller avatar)
- [x] PostActions redesign (pill containers, arrow icons, share right-aligned)
- [x] FollowButton size reduction
- [x] FeedHeader popup menu (react-native-popup-menu with feed type options)
- [x] Feed type options: Home, Popular, Latest, News, Watch (with icons)
- [x] Mirage branding (orange color rgb(232, 84, 41) for home feed title)
- [x] Animated chevron rotation on menu open/close
- [ ] Following tab empty state UI redesign

### Phase 5: Comments System (Week 3) ✅

- [x] CommentItem molecule
- [x] CommentThread molecule
- [x] CommentInput molecule
- [x] CommentOptionsSheet molecule
- [x] PostDetailPage

### Phase 6: Authentication (Week 3-4) ✅

- [x] AuthSheet molecule (BottomSheetModal, no handle, centered title)
- [x] RecoveryPhraseGrid molecule
- [x] RecoveryPhraseInput molecule
- [x] OnboardingProgress molecule
- [x] AdultContentPopup molecule
- [x] UsernamePage (full UI with username validation, availability check, terms)
- [x] RecoveryPhrasePage (12-word display with copy, security tips)
- [x] LoginPage (12-word input with paste support)
- [x] Protected tab navigation (auth sheet on Create/Following/Profile/Inbox tabs)
- [x] Auth flow navigation (back to auth sheet from auth pages)

### Phase 7: Create Post (Week 4)

- [ ] TopicSelector molecule
- [ ] ContentWarningSelector molecule
- [ ] MediaPickerBar molecule
- [ ] CreatePage

### Phase 8: Profile (Week 4-5)

- [ ] ProfileHeader molecule
- [ ] ProfileStats molecule
- [ ] ProfilePage

### Phase 9: Polish (Week 5)

- [ ] Haptic feedback refinement
- [ ] Animation polish
- [ ] Error states
- [ ] Loading states
- [ ] Empty states

---

## Notes

- All components use **Unistyles v3** for styling
- Use existing **primitives** (`Box`, `Text`, `Button`, etc.) as building blocks
- Follow the atomic design pattern strictly: **atoms → molecules → pages**
- Use **Expo Router v6** file-based routing conventions
- **Bun** is the package manager (not npm/yarn)
- **@gorhom/bottom-sheet** is already configured with providers

---

_Document Version: 1.5_
_Created: December 2024_
_Last Updated: December 29, 2024_
