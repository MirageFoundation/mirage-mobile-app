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
10. [New Feature Layouts (ASCII)](#10-new-feature-layouts-ascii)
11. [New Component Architecture](#11-new-component-architecture)
12. [Updated Preferences Store](#12-updated-preferences-store)
13. [Route Structure Updates](#13-route-structure-updates)

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
│ │  ←  │              [App Icon]              │              │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│          🔐 Save Your Recovery Phrase                          │
│                    @username                                    │
│                                                                │
│   ⚠️  Important: Below Is Your Recovery Phrase.                 │
│       This 12-word phrase is the ONLY way to recover           │
│       your account. Write it down and store it safely           │
│       offline. Anyone with this phrase can access your          │
│       account!                                                  │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │1 word   │ │2 word   │ │3 word   │ │4 word   │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │5 word   │ │6 word   │ │7 word   │ │8 word   │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │9 word   │ │10 word  │ │11 word  │ │12 word  │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │              [ 📋 Copy Phrase ]                        │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│      ☐ I have saved my recovery phrase securely                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │            Continue to Mirage                     │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**Design Details:**

- Header: Back button (left), app icon (center), empty space (right) - no title or close button
- Shield icon: Reduced size (32px icon, 60x60 container)
- Title: "Save Your Recovery Phrase" (xl size)
- Subtitle: "@username" format
- Warning banner: Updated text with "Important: Below Is Your Recovery Phrase." in semibold
- Word chips: No divider between number and word, reduced padding, compact design
- Copy button: Redesigned with animated icon/text transitions, success state styling
- Checkbox: Smaller size (sm checkbox, xs text, reduced padding)
- Button: "Continue to Mirage" text, no arrow icon, full rounded corners
- Navigation: Dismisses all auth modals and navigates to home tab on continue

### 4.8 Login Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ✕  │                                      │               │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                      ┌───────────┐                             │
│                      │ App Icon  │                             │
│                      └───────────┘                             │
│                                                                │
│                    Login to Mirage                             │
│                                                                │
│        Sign in to your existing Mirage account                 │
│           with your 12-word recovery phrase:                   │
│                                                                │
│   ┌────────────────────────────────────────────────────────┐   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │1 ______ │ │2 ______ │ │3 ______ │ │4 ______ │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │5 ______ │ │6 ______ │ │7 ______ │ │8 ______ │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │   │
│   │  │9 ______ │ │10 _____ │ │11 _____ │ │12 _____ │      │   │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │   │
│   │                                                        │   │
│   │           ████████████░░░░░░░░░░░░ 6/12                │   │
│   │                                                        │   │
│   └────────────────────────────────────────────────────────┘   │
│                                                                │
│      ⚠️ Some words appear to be invalid (error message)        │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                    Log in                         │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                  Create a new account                          │
└────────────────────────────────────────────────────────────────┘
```

**Design Details:**

- Header: Close button (left) only, no title
- App icon: 44x44 with 16px border radius
- Title: "Login to Mirage" (26px, bold)
- Subtitle: "Sign in to your existing Mirage account with your 12-word recovery phrase:"
- Recovery phrase input: 4x3 grid with progress bar
- Content: Vertically centered
- Error message: Left-aligned, positioned above login button
- Login button: Below progress bar (fully rounded, custom disabled state: gray bg, subtle text)
- Footer: Divider line + "Create a new account" link (navigates to username page)

### 4.10 Onboarding Progress (Status Display)

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

### 4.11 Comment More Options Sheet

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

### 4.12 Adult Content Popup

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
  - [x] Updated warning banner with new text formatting
  - [x] Redesigned copy button with animated transitions (icon/text scale animation)
  - [x] Copy button success state styling (background/border color changes)
  - [x] Removed hide/show toggle button
  - [x] Updated word grid styling
- [x] RecoveryPhraseInput molecule
- [x] OnboardingProgress molecule
- [x] AdultContentPopup molecule
- [x] UsernamePage (full UI with username validation, availability check, terms)
- [x] RecoveryPhrasePage
  - [x] Header redesign: app icon center, no title, no close button
  - [x] Reduced shield icon size (32px icon, 60x60 container)
  - [x] Reduced title size (xl)
  - [x] Subtitle format: "@username"
  - [x] Updated warning banner text with emphasis formatting
  - [x] Removed security tips section
  - [x] Reduced checkbox confirmation size
  - [x] Button text: "Continue to Mirage" (no arrow icon, full rounded)
  - [x] Navigation: dismisses all auth modals and navigates to home tab
- [x] WordChip atom updates
  - [x] Removed divider between number and word
  - [x] Reduced padding and height (34px height)
  - [x] Compact design with centered content
- [x] LoginPage
  - [x] Header redesign: close button only (no title)
  - [x] App icon instead of key icon (44x44, 16px border radius)
  - [x] Title: "Login to Mirage"
  - [x] Subtitle: "Sign in to your existing Mirage account with your 12-word recovery phrase:"
  - [x] 12-word recovery phrase input with paste support
  - [x] Content vertically centered
  - [x] Error message positioned above login button
  - [x] "Log in" button below progress bar (fully rounded, custom disabled state styling)
  - [x] Footer with divider and "Create a new account" link (navigates to username page)
- [x] Protected tab navigation (auth sheet on Create/Following/Profile/Inbox tabs)
- [x] Auth flow navigation (back to auth sheet from auth pages)

### Phase 7: Create Post (Week 4) 🚧

- [x] CommunitySelectionModal (replaces TopicSelector)
- [x] AdultContentPopup (permission popup shown on first visit to home feed)
- [x] MediaPickerBar (inline in CreatePage)
- [x] CreatePage
  - [x] Header with close button and Post button
  - [x] Community selector with avatar and name
  - [x] Title input (required)
  - [x] Tags button (placeholder)
  - [x] Link input with URL validation
  - [x] Image picker with full-width preview (auto height based on aspect ratio)
  - [x] Video picker
  - [x] Body input (optional)
  - [x] Media picker bar (link, image, video icons)
  - [x] Draft state management with Zustand
  - [x] Updated to use new expo-image-picker API (MediaType instead of deprecated MediaTypeOptions)
  - [ ] Content warning selection for posts

### Phase 8: Profile (Week 4-5)

- [ ] ProfileHeader molecule
- [ ] ProfileStats molecule
- [ ] ProfilePage
- [ ] ProfileMenuSheet molecule (settings menu options)

### Phase 9: Settings Page (Week 5-6) ✅

- [x] Settings page route setup (`app/settings.tsx`)
- [x] SectionList with sticky headers implementation
- [x] Dark Mode Section
  - [x] Automatic toggle (follow system setting)
  - [x] Dark Mode toggle
  - [x] Mutual exclusivity logic (only one can be on at a time)
- [x] Content Section
  - [x] Content type selection (All / SFW Only / Custom)
  - [x] Blur sensitive media toggle
  - [x] Immediately hide downvoted posts toggle
- [x] Comments Section
  - [x] Auto-collapse threshold selector (collapse comments at or below score)
- [x] Sidebar Section
  - [x] Number of topics before "show more" selector
  - [x] Number of people before "show more" selector
- [x] PreferencesStore updates for new settings
- [x] LogoutConfirmationPopup component
- [x] Navigation from ProfileMenuSheet to Settings
- [x] ValuePickerSheet component for selection options
- [x] SettingRow component (toggle, navigate, value types)
- [x] ThemeSelector component with toggle rows

### Phase 10: Subscription Page (Week 6) ✅

- [x] Subscription page route (`app/subscription.tsx`)
- [x] ActivePlanCard component (displays current plan, balance, reserve)
- [x] PlanCard component (displays available plans with expand/collapse)
  - [x] Plan header with icon, title, and cost
  - [x] Short features list (collapsed view)
  - [x] Full features list (expanded view)
  - [x] "See all details" / "Hide details" toggle with animated chevron
  - [x] Action button: Active Plan / Insufficient Funds / Subscribe
- [x] Four subscription tiers: Free, Trusted, Established, Distinguished
  - [x] Free: 0 MIRAGE/day - PoW for transactions, 1,000 chars, basic posting
  - [x] Trusted: 1 MIRAGE/day - Instant posting, 2,000 chars, profile customization
  - [x] Established: 2 MIRAGE/day - 5,000 chars, moderator eligibility, more awards
  - [x] Distinguished: 3 MIRAGE/day - 25,000 chars, max vote weight, all features
- [x] Footer disclaimer about daily billing and token burning
- [x] Navigation from ProfileMenuSheet to Subscription screen

### Phase 11: Invite & Earn Page (Week 6) ✅

- [x] Invite page route (`app/invite-and-earn.tsx`)
- [x] ReferralLinkCard component (2 shareable links with copy functionality)
- [x] HowItWorks section with bullet points and example calculation
- [x] RewardsBreakdown component with gradient-styled stats cards
  - [x] Pending rewards (amber gradient)
  - [x] Paid rewards (green gradient)
  - [x] Number of referrals (purple gradient)
- [x] Important note/disclaimer section (sockpuppet warning)
- [x] Navigation from ProfileMenuSheet to Invite & Earn screen

### Phase 12: Logout Confirmation (Week 6)

- [ ] LogoutConfirmationPopup component
- [ ] Integrate with ProfileMenuSheet
- [ ] Clear auth state on confirm
- [ ] Navigate to home on logout

### Phase 13: Theme System (Week 6-7)

- [ ] Define dark mode color palette in `theme.ts`
- [ ] Update Unistyles theme configuration for light/dark variants
- [ ] Create useTheme hook for theme switching
- [ ] Persist theme preference in PreferencesStore
- [ ] Update all components to use theme-aware colors
- [ ] System theme detection support

### Phase 14: Search Functionality (Week 7)

- [ ] Search screen/modal (`app/search.tsx`)
- [ ] Search input with auto-focus
- [ ] Recent searches display
- [ ] Search results (posts, users, topics)
- [ ] Navigation from FeedHeader search button

### Phase 15: Network Page (Week 7+) - Deferred

- [ ] Network page route (`app/network.tsx`)
- [ ] Network status display
- [ ] (Details to be discussed later)

### Phase 16: Polish (Week 8)

- [ ] Haptic feedback refinement
- [ ] Animation polish
- [ ] Error states
- [ ] Loading states
- [ ] Empty states

---

## 10. New Feature Layouts (ASCII)

### 10.1 Settings Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │              Settings               │                │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  APPEARANCE                              (sticky header) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🎨 Theme                                                │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │  │
│  │  │  Light  │  │  Dark   │  │ System  │                  │  │
│  │  └─────────┘  └─────────┘  └─────────┘                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CONTENT                                 (sticky header) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  🔞 Content Type                                    ▼    │  │
│  │  All Content / SFW Only / Custom                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  👁️ Blur Sensitive Media                         [  ◉ ] │  │
│  │  Blur thumbnails of sensitive content                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  👎 Hide Downvoted Posts                         [  ◉ ] │  │
│  │  Immediately hide posts you downvote                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  COMMENTS                                (sticky header) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📉 Auto-Collapse Threshold                         ▼    │  │
│  │  Collapse comments at or below score: -5                │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Options: -10, -5, -3, -1, 0, Never                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SIDEBAR                                 (sticky header) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  📂 Topics Before "Show More"                       ▼    │  │
│  │  Currently: 5                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Options: 3, 5, 7, 10, All                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  👥 People Before "Show More"                       ▼    │  │
│  │  Currently: 5                                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Options: 3, 5, 7, 10, All                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 10.2 Subscription Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │            Subscription             │                │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   YOUR CURRENT PLAN                      │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │      ┌─────────────────────────────────────────┐        │  │
│  │      │  ⭐ Premium                              │        │  │
│  │      │  ──────────────────────────────────     │        │  │
│  │      │  Active until: Feb 15, 2026             │        │  │
│  │      │  ✓ Ad-free experience                   │        │  │
│  │      │  ✓ Custom themes                        │        │  │
│  │      │  ✓ Priority support                     │        │  │
│  │      └─────────────────────────────────────────┘        │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   AVAILABLE PLANS                        │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  🆓 Free                                           │  │  │
│  │  │  $0/month                                          │  │  │
│  │  │  • Basic features                                  │  │  │
│  │  │  • Ad-supported                                    │  │  │
│  │  │  • Standard support                                │  │  │
│  │  │                            [ Current Plan ]        │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  ⭐ Premium                              POPULAR    │  │  │
│  │  │  $4.99/month                                       │  │  │
│  │  │  • Everything in Free                              │  │  │
│  │  │  • Ad-free experience                              │  │  │
│  │  │  • Custom themes                                   │  │  │
│  │  │  • Priority support                                │  │  │
│  │  │                            [ Upgrade ]             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  💎 Pro                                            │  │  │
│  │  │  $9.99/month                                       │  │  │
│  │  │  • Everything in Premium                           │  │  │
│  │  │  • Early access features                           │  │  │
│  │  │  • Exclusive badges                                │  │  │
│  │  │  • API access                                      │  │  │
│  │  │                            [ Upgrade ]             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 10.3 Invite & Earn Page

```
┌────────────────────────────────────────────────────────────────┐
│ ┌────────────────────────────────────────────────────────────┐ │
│ │  ←  │            Invite & Earn            │                │ │
│ └────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  🎁 YOUR REFERRAL LINKS                  │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  📱 Standard Link                                  │  │  │
│  │  │  mirage.app/ref/abc123xyz                          │  │  │
│  │  │                        [ 📋 Copy ]  [ 📤 Share ]   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  🎯 Campaign Link                                  │  │  │
│  │  │  mirage.app/ref/abc123xyz?c=social                 │  │  │
│  │  │                        [ 📋 Copy ]  [ 📤 Share ]   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    HOW IT WORKS                          │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │  1️⃣  Share your referral link with friends               │  │
│  │                                                          │  │
│  │  2️⃣  They sign up using your link                        │  │
│  │                                                          │  │
│  │  3️⃣  You both earn rewards!                              │  │
│  │                                                          │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  💡 Example: If you refer 10 friends who each spend      │  │
│  │     $10, you earn $10 (10% commission)                   │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   YOUR REWARDS                           │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Pending    │  │     Paid     │  │  Referrals   │   │  │
│  │  │    $12.50    │  │    $45.00    │  │      23      │   │  │
│  │  │   ⏳ 3 days   │  │   ✓ Total    │  │   👥 Users   │   │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ⚠️ IMPORTANT NOTE                                       │  │
│  │  ─────────────────────────────────────────────────────   │  │
│  │  Rewards are paid out monthly. Minimum payout is $10.   │  │
│  │  Fraudulent referrals will result in account            │  │
│  │  suspension. See Terms of Service for full details.     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 10.4 Logout Confirmation Popup

```
┌────────────────────────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░ Blurred Background ░░░░░░░░░░░░░░░░░░░░  │
│                                                                │
│     ┌──────────────────────────────────────────────────┐       │
│     │                                                  │       │
│     │              🚪 Logout                           │       │
│     │                                                  │       │
│     │    Are you sure you want to log out?            │       │
│     │                                                  │       │
│     │    You'll need your recovery phrase to          │       │
│     │    log back in.                                 │       │
│     │                                                  │       │
│     │  ┌────────────────────────────────────────────┐  │       │
│     │  │              Cancel                        │  │       │
│     │  └────────────────────────────────────────────┘  │       │
│     │                                                  │       │
│     │  ┌────────────────────────────────────────────┐  │       │
│     │  │              Log Out                       │  │       │
│     │  └────────────────────────────────────────────┘  │       │
│     │                                                  │       │
│     └──────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. New Component Architecture

### 11.1 Settings Components

```
src/components/
├── molecules/
│   ├── settings/
│   │   ├── index.ts
│   │   ├── setting-row.tsx           # Individual setting row (icon, label, control)
│   │   ├── setting-section.tsx       # Section with sticky header
│   │   ├── theme-selector.tsx        # Light/Dark/System toggle
│   │   ├── value-picker.tsx          # Dropdown/picker for numeric values
│   │   └── setting-toggle.tsx        # Row with switch toggle
│   └── ...
│
├── pages/
│   ├── settings-screen.tsx           # Settings page composition
│   └── ...
```

### 11.2 Subscription Components

```
src/components/
├── molecules/
│   ├── subscription/
│   │   ├── index.ts
│   │   ├── active-plan-card.tsx      # Current plan display
│   │   ├── plan-card.tsx             # Individual plan option
│   │   └── plan-feature-list.tsx     # Feature bullet list
│   └── ...
│
├── pages/
│   ├── subscription-screen.tsx       # Subscription page composition
│   └── ...
```

### 11.3 Invite Components

```
src/components/
├── molecules/
│   ├── invite/
│   │   ├── index.ts
│   │   ├── referral-link-card.tsx    # Shareable link with copy/share
│   │   ├── how-it-works.tsx          # Steps explanation
│   │   ├── rewards-breakdown.tsx     # Pending/Paid/Referrals cards
│   │   └── important-note.tsx        # Warning/info banner
│   └── ...
│
├── pages/
│   ├── invite-screen.tsx             # Invite page composition
│   └── ...
```

### 11.4 Logout Components

```
src/components/
├── molecules/
│   ├── logout-confirmation-popup.tsx # Confirmation modal
│   └── ...
```

---

## 12. Updated Preferences Store

```typescript
// src/stores/preferences-store.ts (updated)
type PreferencesState = {
  // Existing
  adultContentEnabled: boolean;
  hasSeenAdultPrompt: boolean;
  feedType: "home" | "popular" | "news";

  // Theme
  theme: "light" | "dark" | "system";

  // Content
  contentFilter: "all" | "sfw" | "custom";
  blurSensitiveMedia: boolean;
  hideDownvotedPosts: boolean;

  // Comments
  autoCollapseThreshold: number; // -10, -5, -3, -1, 0, or null (never)

  // Sidebar
  topicsBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)
  peopleBeforeShowMore: number; // 3, 5, 7, 10, or -1 (all)

  // Actions
  setTheme: (theme: "light" | "dark" | "system") => void;
  setContentFilter: (filter: "all" | "sfw" | "custom") => void;
  setBlurSensitiveMedia: (blur: boolean) => void;
  setHideDownvotedPosts: (hide: boolean) => void;
  setAutoCollapseThreshold: (threshold: number) => void;
  setTopicsBeforeShowMore: (count: number) => void;
  setPeopleBeforeShowMore: (count: number) => void;
  // ... existing actions
};
```

---

## 13. Route Structure Updates

```
app/
├── (tabs)/
│   ├── _layout.tsx
│   ├── index.tsx               # Home
│   ├── following.tsx           # Following
│   ├── create.tsx              # Create
│   ├── inbox.tsx               # Inbox
│   └── profile.tsx             # Profile
├── post/
│   └── [id].tsx                # Post detail
├── (auth)/
│   ├── _layout.tsx
│   ├── username.tsx
│   ├── recovery-phrase.tsx
│   └── login.tsx
├── settings.tsx                # Settings page
├── subscription.tsx            # Subscription page
├── invite-and-earn.tsx         # Invite & Earn page
├── search.tsx                  # Search page (NEW)
├── network.tsx                 # Network page (FUTURE)
└── _layout.tsx
```

---

## Notes

- All components use **Unistyles v3** for styling
- Use existing **primitives** (`Box`, `Text`, `Button`, etc.) as building blocks
- Follow the atomic design pattern strictly: **atoms → molecules → pages**
- Use **Expo Router v6** file-based routing conventions
- **Bun** is the package manager (not npm/yarn)
- **@gorhom/bottom-sheet** is already configured with providers

---

_Document Version: 2.1_
_Created: December 2024_
_Last Updated: January 3, 2026_
