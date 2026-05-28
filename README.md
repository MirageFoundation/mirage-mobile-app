# Mirage Mobile App

Mirage is an Expo / React Native mobile app for the Mirage social network. The app supports feed browsing, posting, comments, media sharing, wallet-backed identity, proof-of-work signing, referrals, quests, notifications, deep links, and app update flows across iOS and Android.

## Tech stack

- **Runtime / package manager:** Bun
- **Mobile framework:** Expo SDK 54 + React Native 0.81
- **Routing:** Expo Router with typed routes
- **Server state:** TanStack Query with persisted cache support
- **Client state:** Zustand + MMKV persistence
- **Styling:** React Native Unistyles and shared theme utilities
- **Media:** Expo Image, Vision Camera, video thumbnails, video trim, Cloudflare/media helpers
- **Notifications:** Expo Notifications with local inbox notification orchestration
- **Observability:** Sentry in non-F-Droid builds
- **Crypto / wallet:** native random values, keychain/secure store, Argon2, proof-of-work helpers

## App capabilities

- Home, following, popular/news/watch/latest feeds
- Post creation, editing, comments, replies, awards, gifts, voting, reports, delete/block flows
- Image/video media previews, share intent handling, link previews, stickers, Giphy search, YouTube embeds
- User profiles, saved posts, history, search, topics, settings, blocked list, and account deletion
- Invite/referral flows, quests, subscription screens, and transaction progress UI
- Wallet bootstrap, recovery phrase display, username onboarding, local authentication, and API server switching
- Universal Links / App Links for `mirage.talk` and `mirage.vote`
- Production force-update prompt and Expo OTA update checks

## Getting started

### Prerequisites

- Bun installed locally
- Expo-compatible iOS/Android development setup
- A development build is recommended because the app uses native modules and custom config plugins. Expo Go is not expected to support the full app.

### Install dependencies

```bash
bun install
```

### Start the app

```bash
bun run start
```

Then choose a target from the Expo CLI, or run a platform command directly:

```bash
bun run ios
bun run android
bun run web
```

## Environment variables

The app can run with defaults for local development, but these variables are recognized:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_ENV` | Optional app environment suffix. Used for app name, bundle/package id, scheme, and EAS channels such as `dev` or `preview`. |
| `EXPO_PUBLIC_FDROID` | Set to `true` for F-Droid prebuilds. Disables Sentry and Expo Updates in app config. |
| `GOOGLE_SERVICES_JSON` | Google services file path/value used by non-F-Droid Android builds. |
| `EXPO_PUBLIC_GIPHY_API_KEY` | Optional Giphy key. A fallback key exists in code, but a project key should be used for production. |
| `EXPO_PUBLIC_FORCE_JS_POW` / `FORCE_JS_POW` | Forces JavaScript proof-of-work implementation for debugging. |
| `EXPO_PUBLIC_POW_MAX_SECONDS` | Optional proof-of-work timeout tuning. |

Default API and share server settings start from `mirage.talk`; the app can also discover/use peers such as `mirage.vote`.

## Common commands

Always use Bun for repository commands.

| Command | Description |
| --- | --- |
| `bun run start` | Start Expo dev server. |
| `bun run ios` | Start Expo targeting iOS. |
| `bun run android` | Start Expo targeting Android. |
| `bun run web` | Start Expo web output. |
| `bun run lint` | Run Expo ESLint. |
| `bun run typecheck` | Run TypeScript with `--noEmit`. |
| `bun run check:file-sizes` | Report large page files. |
| `bun run check:navigation` | Smoke-check route and deep-link parsing. |
| `bun run check:stores` | Guard Zustand store boundaries. |
| `bun run check:boundaries` | Check layer boundaries. |
| `bun run check:query-keys` | Guard against raw query-key literal regressions. |
| `bun run check:architecture` | Run the full architecture guardrail suite. |
| `bun run prebuild:fdroid` | Prebuild Android with F-Droid flags. |

## Project structure

```text
app/                 Expo Router route wrappers and layouts only
src/pages/           Feature page containers and screen modules
src/components/      Shared UI atoms, molecules, and app UI primitives
src/api/read/        Read endpoints, hooks, and query keys
src/api/write/       Write endpoints, hooks, mutation keys, and signing helpers
src/api/cache/       Reusable TanStack Query cache update helpers
src/navigation/      Route map, linking, guarded router, auth navigation, layouts
src/stores/          Zustand client-state stores
src/providers/       Root providers for query, theme, wallet, toasts, server switching
src/services/        App-level services such as bootstrap, wallet, notifications, POW queue
src/domain/          Shared domain-safe model types
src/hooks/           Cross-feature hooks
src/utils/           Shared utilities and polyfills helpers
src/wallet/          Wallet, address, crypto, and proof-of-work logic
assets/              Images and static app assets
docs/                Architecture notes, implementation plans, deep-link and release docs
tools/               Guardrail scripts and project checks
patches/             patch-package patches applied after install
```

## Architecture notes

This project intentionally keeps route wrappers thin:

- `app/` contains Expo Router wrappers, layouts, and route-level config.
- Feature implementation lives under `src/pages/*`.
- Navigation, deep-link parsing, and guarded routing live in `src/navigation/*`.
- Query keys live in `src/api/read/query-keys.ts`; mutation keys live in `src/api/write/mutation-keys.ts`.
- Reusable cache mutations belong in `src/api/cache/*`.
- Zustand stores are for client state only and must not import pages/components.
- Shared data model types should be placed under `src/domain/*` when they cross feature boundaries.

See `AGENTS.md` and `docs/architecture-conventions.md` for the current guardrails.

## Deep links

The app supports Universal Links and Android App Links for:

- `https://mirage.talk/...`
- `https://mirage.vote/...`

Core deep-link code lives in:

- `src/navigation/route-map.ts`
- `src/navigation/linking.ts`
- `src/navigation/guarded-router.ts`
- `src/navigation/auth-navigation.ts`

Additional setup notes are in `docs/deep-linking-setup.md`.

## Builds and releases

EAS build profiles are defined in `eas.json`:

- `sim` — iOS simulator development client
- `dev` — internal development client
- `preview` — internal preview channel
- `production` — production channel with app version source managed remotely

App config is generated from `app.config.ts`. The production bundle identifier/package is `talk.mirage.mobile`; environment builds append the environment suffix. F-Droid-specific Android prebuilds use:

```bash
bun run prebuild:fdroid
```

## Force update remote config

The app checks a remote JSON file on launch to determine whether a blocking app update prompt is required. This allows update enforcement without shipping a new build.

**Repo:** [mesonalirajput/mirage-remote-config](https://github.com/mesonalirajput/mirage-remote-config)  
**File:** `app-version.json`  
**Raw URL:** `https://raw.githubusercontent.com/mesonalirajput/mirage-remote-config/main/app-version.json`

### Config format

```json
{
  "ios": {
    "version": "1.0.15",
    "required": true
  },
  "android": {
    "version": "1.0.15",
    "required": true
  }
}
```

- `version` — minimum required app version for that platform
- `required` — when `true`, users on older versions see a blocking update popup

### Triggering a force update

1. Edit [`app-version.json`](https://github.com/mesonalirajput/mirage-remote-config/edit/main/app-version.json).
2. Bump the `version` for iOS, Android, or both.
3. Set `required: true` for a blocking update.
4. Commit the change. The app picks it up on next launch, subject to GitHub CDN cache delay.

Implementation details:

- `src/hooks/use-force-update.ts` fetches the config and compares it with `Constants.expoConfig.version`.
- `src/components/molecules/force-update-popup.tsx` renders the blocking popup.
- The check is skipped in development builds.
- Expo OTA update checks run separately after the version check.

## Verification before merging

For most changes, run the focused check that matches the touched area. For broader work, run:

```bash
bun run check:architecture
bun run typecheck
bun run lint
```

Do not commit generated native folders or build outputs unless the change explicitly requires them.
