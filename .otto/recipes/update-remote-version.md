---
description: Update Mirage’s remote GitHub app-version config used by both Android and iOS to decide whether users should see a blocking or dismissible update popup.
agent: build
includeInHistory: true
---

Remote config:
- GitHub repo: `mesonalirajput/mirage-remote-config`
- Branch: `main`
- File: `app-version.json`
- Raw URL: `https://raw.githubusercontent.com/mesonalirajput/mirage-remote-config/main/app-version.json`

The mobile app reads this config from `src/hooks/use-force-update.ts`.
Each platform has:
- `version`: minimum required native app version
- `required`: boolean; `true` means blocking popup, `false` means dismissible popup

The JSON shape must stay:

{
  "ios": {
    "version": "1.1.1",
    "required": true
  },
  "android": {
    "version": "1.1.1",
    "required": true
  }
}

Execution steps:
2. Ask user for platforms and version
2. Enable/use the GitHub MCP tools.
3. Fetch `app-version.json` from `mesonalirajput/mirage-remote-config` on branch `main`.
4. Parse the recipe arguments using the rules above.
5. Build the updated JSON by changing only requested platform entries.
6. Preserve existing valid values for platforms not requested.
7. Commit the updated `app-version.json` back to `main` with message:
   `Update app version requirements`
8. Report:
   - previous iOS config
   - new iOS config
   - previous Android config
   - new Android config
   - whether the popup is blocking or dismissible
   - the raw GitHub config URL