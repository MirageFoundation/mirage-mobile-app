# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Architecture Checks

Useful verification commands:

```bash
bun run check:file-sizes
bun run check:navigation
bun run check:stores
bun run check:query-keys
bun run check:architecture
```

See `docs/architecture-conventions.md` for the current structural conventions.

## Force Update (Remote Version Config)

The app checks a remote JSON file on launch to determine if a force update is needed. This lets us trigger update prompts without deploying a new app build.

### Config location

**Repo:** [mesonalirajput/mirage-remote-config](https://github.com/mesonalirajput/mirage-remote-config)
**File:** `app-version.json`
**Raw URL:** `https://raw.githubusercontent.com/mesonalirajput/mirage-remote-config/main/app-version.json`

### Config format

```json
{
  "ios": {
    "version": "1.0.8",
    "required": true
  },
  "android": {
    "version": "1.0.8",
    "required": true
  }
}
```

- `version` — the minimum required app version for that platform
- `required` — if `true`, users on an older version see a blocking popup directing them to the app store

### How to trigger a force update

1. Go to [app-version.json](https://github.com/mesonalirajput/mirage-remote-config/edit/main/app-version.json)
2. Bump the `version` for `ios`, `android`, or both
3. Set `required: true` to make it blocking
4. Commit — the app will pick up the change on next launch (may take ~5 min due to GitHub CDN cache)

### How it works

- `src/hooks/use-force-update.ts` fetches the config and compares against the app's current version (`Constants.expoConfig.version`)
- If the app version is older than the remote version and `required` is `true`, a full-screen popup is shown directing the user to the App Store / Play Store
- The check only runs in production builds (`__DEV__` is skipped)
- OTA (expo-updates) checks run separately after the version check
