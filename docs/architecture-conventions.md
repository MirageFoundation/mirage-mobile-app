# Architecture Conventions

## Routing
- `app/` is routing, layout, and route config only.
- Route files should be thin wrappers over `src/pages/*`.
- Keep navigation parsing and auth-aware deep-link behavior in `src/navigation/*`.
- Current refactor priority: extract the remaining large route implementations from `app/` before doing effect cleanup.

## Pages
- Prefer modular feature folders under `src/pages/<feature>/*`.
- Soft warning: files over 400 lines.
- Strong refactor target: files over 600 lines.

## Stores
- `src/stores/*` must not import from `src/pages/*`.
- `src/stores/*` must not import from `src/components/*` for shared model types.
- Shared data model types should live in `src/domain/*`.
- Zustand should own client state, not server-state orchestration.

## Query / Cache
- Use centralized helpers from `src/api/read/query-keys.ts`.
- Avoid raw literal query keys in app code.
- Reusable cache mutation logic belongs in `src/api/cache/*`.
- Prefer targeted invalidation/removal over `queryClient.clear()` in normal flows.
- Write hooks should define `mutationKey`.

## Dependency Policy
- Keep structural refactors dependency-neutral unless a separate task explicitly asks for dependency work.
- Do not upgrade Expo, React Native, native video/media libraries, or PoW native modules as part of cleanup refactors.

## Verification Commands
- Current available command: `bun run lint`.
- Planned guardrails, not currently present in this codebase version:
  - `bun run check:file-sizes`
  - `bun run check:navigation`
  - `bun run check:stores`
  - `bun run check:query-keys`
  - `bun run check:architecture`
