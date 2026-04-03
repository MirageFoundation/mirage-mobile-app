# Implementation Plan: Rename `porn` → `adult` Tag

## Summary

Replace all references to `"porn"` with `"adult"` across the mobile app for App Store compliance. The backend already accepts both values (backward compatible), so this is a client-only migration.

---

## Files to Change (12 source files)

### 1. Type Definitions

#### `src/api/write/endpoints/posts.ts:24`
- Change `ContentTag` type: `"porn"` → `"adult"`
```ts
// Before
export type ContentTag = "" | "sensitive" | "porn" | "gore" | "violence" | "death";
// After
export type ContentTag = "" | "sensitive" | "adult" | "gore" | "violence" | "death";
```

#### `src/api/write/signing/canonical.ts:212`
- Update JSDoc comment: `"porn"` → `"adult"`

---

### 2. Preferences Store

#### `src/stores/preferences-store.ts`
**10+ changes — central to the migration**

| Line(s) | Change |
|---------|--------|
| 12 | `ContentType`: `"porn"` → `"adult"` |
| 19 | `CONTENT_TAGS` array: `"porn"` → `"adult"` |
| 20 | `ADULT_CONTENT_TAGS` array: `"porn"` → `"adult"` |
| 190 | Fallback value: `["porn"]` → `["adult"]` |
| 226–235 | `toggleContentType("all")`: rename `hasPorn` → `hasAdult`, `nonPornTags` → `nonAdultTags`, filter `"porn"` → `"adult"` |
| 240–243 | `toggleContentType("none")`: rename `hadPorn` → `hadAdult`, value `"porn"` → `"adult"` |

---

### 3. Tag Mapping (API response → UI)

#### `src/api/read/utils/transform-post.ts:70–75`
- Map both `"adult"` and `"porn"` from API to `"adult"` UI type (instead of `"porn"`)
```ts
// Before
adult: "porn",
porn: "porn",
// After
adult: "adult",
porn: "adult",  // backward compat for any cached/old responses
```

#### `src/pages/topics-list-screen.tsx:118–120`
- Same tag map change as above
```ts
// Before
adult: "porn",
porn: "porn",
// After
adult: "adult",
porn: "adult",
```

---

### 4. UI Components

#### `src/components/atoms/content-warning-badge.tsx`
- `ContentWarningType`: `"porn"` → `"adult"` (line 9)
- `WARNING_CONFIG`: rename key `porn` → `adult`, label `"Porn"` → `"Adult"` (line 28)

#### `src/components/molecules/adult-content-popup.tsx:174`
- Change copy from `"pornography"` to `"adult content"` or `"mature content"`

#### `src/components/molecules/settings/content-type-sheet.tsx:97–99`
- Rename `NON_PORN_TAGS` → `NON_ADULT_TAGS`
- Change `"porn"` check to `"adult"` in `isNoneSelected`

---

### 5. Screens

#### `src/pages/create-screen.tsx:84`
- Change content warning option: `{ value: "porn", label: "Porn" }` → `{ value: "adult", label: "Adult" }`

#### `src/pages/annotate-screen.tsx:52`
- Same change as create-screen

#### `src/pages/settings-screen.tsx`
| Line | Change |
|------|--------|
| 107 | `includes("porn")` → `includes("adult")` |
| 118 | `"porn"` in array → `"adult"` |
| 172 | Filter `"porn"` → `"adult"` |
| 173–175 | Rename `NON_PORN_TAGS` → `NON_ADULT_TAGS`, `allNonPornSelected` → `allNonAdultSelected` |

---

### 6. Documentation (optional, low priority)

- `docs/create-post-upgrade-plan.md` — 3 mentions of `"porn"`
- `docs/api-plans/03-write-api-plan.md` — 1 mention
- `docs/api-plans/endpoint-plan.md` — 1 mention

---

## Migration Considerations

### User Preferences (MMKV persistence)
The preferences store uses `zustand/persist` with MMKV. Existing users may have `"porn"` stored in `selectedContentTypes`. Add a migration in the store rehydration to map any persisted `"porn"` values to `"adult"` so users don't lose their preferences.

```ts
// In the persist config's `onRehydrateStorage` or `migrate`:
// If selectedContentTypes contains "porn", replace with "adult"
```

---

## Execution Order

1. **Types first** — `posts.ts` ContentTag, `preferences-store.ts` ContentType
2. **Store logic** — `preferences-store.ts` (constants, toggle logic, migration)
3. **API mapping** — `transform-post.ts`, `topics-list-screen.tsx` tag maps
4. **UI components** — `content-warning-badge.tsx`, `adult-content-popup.tsx`, `content-type-sheet.tsx`
5. **Screens** — `create-screen.tsx`, `annotate-screen.tsx`, `settings-screen.tsx`
6. **Verify** — TypeScript build, grep for any remaining `"porn"` in `src/`
7. **Notify backend dev** — confirm migration is live so they can remove the legacy alias

---

## Verification

```bash
# Should return 0 results in src/ after migration
grep -r '"porn"' src/
grep -r "'porn'" src/

# TypeScript should compile cleanly
bun tsc --noEmit
```

## Post-deploy

Once the app update is rolled out and verified, notify the backend dev to remove the `porn → adult` server-side alias.
