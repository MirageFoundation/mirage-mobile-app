# F-Droid Publishing Plan

## Goal

Publish Mirage on the main F-Droid repository while keeping this repo in Expo managed workflow. We will not commit generated `android/` or `ios/` native projects.

## Confirmed F-Droid approach for Expo

F-Droid can build Expo managed apps by generating the Android project during the `fdroiddata` build. Existing `fdroiddata` metadata, for example `com.alovoa.expo.yml`, uses this pattern:

1. Clone the upstream app source.
2. Install JavaScript dependencies.
3. Run `expo prebuild` during the F-Droid build.
4. Build the generated Android project with Gradle.
5. Delete generated/dependency artifacts after scanning/building.

For Mirage, the build recipe should use Android-only prebuild:

```bash
EXPO_PUBLIC_FDROID=true bunx expo prebuild --platform android --no-install
cd android/app
gradle assembleRelease
```

## Local app repo changes

These changes belong in this repository before opening the `fdroiddata` merge request:

- Add deterministic Android `versionCode` to Expo config.
- Add an `EXPO_PUBLIC_FDROID=true` build mode.
- Disable Sentry runtime behavior for F-Droid builds.
- Omit Sentry config plugin for F-Droid prebuilds.
- Omit Google services config for F-Droid prebuilds.
- Disable Expo OTA updates for F-Droid builds.
- Add Fastlane/F-Droid app metadata.
- Add release changelog for the current Android version code.
- Add a root `LICENSE` after the project license is confirmed.
- Tag the release commit, for example `v1.0.13`.

## F-Droid policy items to watch

F-Droid main repo requires FLOSS source and dependencies. The review will likely focus on:

- Project license and third-party asset licenses.
- Sentry/crash reporting/tracking behavior.
- Firebase/Google services usage.
- OTA update behavior from `expo-updates`.
- Whether the app depends on a non-free network service. This may require an AntiFeature such as `NonFreeNet` or `TetheredNet`, depending on reviewer interpretation.

The F-Droid build mode should avoid proprietary runtime services where possible. If dependency scanning still rejects Sentry or Firebase-related packages, the `fdroiddata` recipe may need a source patch or package install step that removes those dependencies for the F-Droid build.

## Draft `fdroiddata` metadata

Package: `talk.mirage.mobile`

```yaml
Categories:
  - Internet
License: GPL-3.0-or-later
AuthorName: Mirage Foundation
WebSite: https://mirage.talk
SourceCode: https://github.com/MirageFoundation/mirage-mobile-app
IssueTracker: https://github.com/MirageFoundation/mirage-mobile-app/issues

RepoType: git
Repo: https://github.com/MirageFoundation/mirage-mobile-app.git

Builds:
  - versionName: 1.0.13
    versionCode: 1013
    commit: REPLACE_WITH_RELEASE_COMMIT
    sudo:
      - sysctl fs.inotify.max_user_watches=524288
      - curl -Lo bun.zip https://github.com/oven-sh/bun/releases/download/bun-v1.3.8/bun-linux-x64.zip
      - echo "0322b17f0722da76a64298aad498225aedcbf6df1008a1dee45e16ecb226a3f1  bun.zip" | sha256sum -c -
      - unzip bun.zip
      - install -m 0755 bun-linux-x64/bun /usr/local/bin/bun
    init:
      - bun install --frozen-lockfile
    prebuild:
      - EXPO_PUBLIC_FDROID=true bunx expo prebuild --platform android --no-install
    build:
      - cd android/app
      - gradle assembleRelease
    output: android/app/build/outputs/apk/release/app-release.apk
    scandelete:
      - node_modules/

AutoUpdateMode: Version
UpdateCheckMode: Tags
CurrentVersion: 1.0.13
CurrentVersionCode: 1013
```

## GitLab / fdroiddata workflow

After this app repo is ready and pushed/tagged:

```bash
glab repo fork fdroid/fdroiddata --clone
cd fdroiddata
git checkout -b talk.mirage.mobile
cp templates/build-gradle.yml metadata/talk.mirage.mobile.yml
# Edit metadata/talk.mirage.mobile.yml
```

Then test with F-Droid tooling:

```bash
fdroid readmeta
fdroid rewritemeta talk.mirage.mobile
fdroid lint talk.mirage.mobile
fdroid build talk.mirage.mobile
```

Finally open the merge request:

```bash
git add metadata/talk.mirage.mobile.yml
git commit -m "New App: Mirage"
git push -u origin talk.mirage.mobile
glab mr create --target-branch master --title "New App: Mirage" --label "New App"
```

## Open decisions

- Confirm the source license before adding `LICENSE` and before final `fdroiddata` metadata.
- Confirm the real current Android `versionCode` if EAS remote versioning already published a different value than `1013`.
- Provide final screenshots for `fastlane/metadata/android/en-US/images/phoneScreenshots/`.
