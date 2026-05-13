# F-Droid Build Handoff Notes

This is the final repeatable runbook for building Mirage Mobile (`talk.mirage.mobile`) with F-Droid tooling while keeping the app Expo-managed/CNG.

The important result: a local F-Droid build **does succeed** for version `1.0.13` / versionCode `1013`.

```text
Successfully built talk.mirage.mobile:1013 from 74def030241be346e6fd4dbb0ce7b0b9f0563d04
success: talk.mirage.mobile
1 build succeeded
```

## Goal

Publish the Expo-managed React Native app to F-Droid without committing generated native folders (`android/`, `ios/`) to the app source repo.

The working approach is:

1. F-Droid clones the app repo.
2. F-Droid installs JS dependencies with Bun.
3. F-Droid patches the build checkout for F-Droid-specific native autolinking.
4. F-Droid runs Expo prebuild for Android only.
5. F-Droid scans/deletes problematic generated/prebuilt artifacts.
6. F-Droid builds the generated Android project with Gradle.
7. The generated native project remains temporary and is not committed to the app repo.

## Current successful build

App repo:

```text
https://github.com/MirageFoundation/mirage-mobile-app.git
```

F-Droid application ID:

```text
talk.mirage.mobile
```

Successful app release commit/tag:

```text
v1.0.13 -> 74def030241be346e6fd4dbb0ce7b0b9f0563d04
```

Successful APK artifact from local build:

```text
../fdroiddata/unsigned/talk.mirage.mobile_1013.apk
```

Artifact details from the successful local run:

```text
Size: 167M
SHA256: 39d762e8a3112097af840d33a7d8f19e71fceb3276aa7a276457bce6d3fac8a4
Package: talk.mirage.mobile
versionCode: 1013
versionName: 1.0.13
minSdk: 24
targetSdk: 36
```

`aapt` verification command:

```bash
docker exec mirage-fdroid bash -lc \
  '/opt/android-sdk/build-tools/36.0.0/aapt dump badging /home/vagrant/fdroiddata-work/unsigned/talk.mirage.mobile_1013.apk | head -n 5'
```

Expected first line:

```text
package: name='talk.mirage.mobile' versionCode='1013' versionName='1.0.13'
```

## Repos and branches

App repo local path in this workspace:

```text
./
```

F-Droid metadata repo local path:

```text
../fdroiddata
```

F-Droid metadata branch:

```text
talk.mirage.mobile
```

F-Droid metadata file:

```text
../fdroiddata/metadata/talk.mirage.mobile.yml
```

A copy of the working metadata recipe is also kept in the app repo at:

```text
docs/fdroiddata/talk.mirage.mobile.yml
```

## App-side prerequisites already in place

The app repo already contains the important F-Droid-specific app configuration:

- GPL-3.0-or-later `LICENSE`.
- F-Droid/Fastlane metadata and screenshots.
- Deterministic Android version metadata:
  - `versionName: 1.0.13`
  - `versionCode: 1013`
- F-Droid build flag:
  - `src/config/build-flags.ts`
  - `IS_FDROID_BUILD = process.env.EXPO_PUBLIC_FDROID === "true"`
- Root `android/` is ignored; generated native folders are not committed.
- F-Droid mode disables/skips:
  - Sentry runtime/plugin behavior
  - Google services file
  - Expo OTA updates
  - EAS update checks

Useful local sanity check from the app repo:

```bash
EXPO_PUBLIC_FDROID=true bun x expo export --platform android --output-dir dist-test
rm -rf dist-test
```

## Persistent Docker setup

Use a persistent container for this. Throwaway Docker works in theory but is painfully slow because Gradle/SDK/JS caches are lost every run.

Current working persistent container name:

```text
mirage-fdroid
```

Image:

```text
registry.gitlab.com/fdroid/fdroidserver:buildserver
```

Useful mounts from the successful setup:

```text
../fdroiddata       -> /build
../fdroidserver     -> /home/vagrant/fdroidserver
mirage-fdroid-cache -> /home/vagrant/.cache
mirage-fdroid-gradle -> /home/vagrant/.gradle
```

The actual build was run from a container-local copy for speed:

```text
/home/vagrant/fdroiddata-work
```

Why: running `fdroid build` directly on the host bind mount was noticeably slower for Git/source tree operations. Keeping `/home/vagrant/fdroiddata-work` inside the container, then copying the metadata in, made retries faster.

### Start/reuse the container

Check if it already exists/runs:

```bash
docker ps --filter name=mirage-fdroid
```

If it is stopped:

```bash
docker start mirage-fdroid
```

If you need to recreate it, use the same style as the successful environment:

```bash
docker volume create mirage-fdroid-cache
docker volume create mirage-fdroid-gradle

docker run -d --name mirage-fdroid \
  --platform linux/amd64 \
  -v "$PWD/../fdroiddata:/build" \
  -v "$PWD/../fdroidserver:/home/vagrant/fdroidserver" \
  -v mirage-fdroid-cache:/home/vagrant/.cache \
  -v mirage-fdroid-gradle:/home/vagrant/.gradle \
  registry.gitlab.com/fdroid/fdroidserver:buildserver \
  sleep infinity
```

On Apple Silicon, the image runs as `linux/amd64` under emulation/Rosetta. That is expected.

### Prepare the container-local fdroiddata copy

If `/home/vagrant/fdroiddata-work` does not exist yet:

```bash
docker exec mirage-fdroid bash -lc '
  rm -rf /home/vagrant/fdroiddata-work
  cp -a /build /home/vagrant/fdroiddata-work
  cd /home/vagrant/fdroiddata-work
  git status --short
'
```

When you edit metadata on the host, sync it into the container-local copy:

```bash
docker cp ../fdroiddata/metadata/talk.mirage.mobile.yml \
  mirage-fdroid:/home/vagrant/fdroiddata-work/metadata/talk.mirage.mobile.yml

docker exec -u root mirage-fdroid bash -lc \
  'chown vagrant:vagrant /home/vagrant/fdroiddata-work/metadata/talk.mirage.mobile.yml'
```

Fix cache ownership if scanner/build cache permission errors appear:

```bash
docker exec -u root mirage-fdroid bash -lc \
  'chown -R vagrant:vagrant /home/vagrant/.cache /home/vagrant/.gradle /home/vagrant/fdroiddata-work'
```

## Metadata validation commands

From the host:

```bash
docker exec mirage-fdroid bash -lc '
  cd /home/vagrant/fdroiddata-work &&
  /home/vagrant/fdroidserver/fdroid readmeta &&
  /home/vagrant/fdroidserver/fdroid rewritemeta talk.mirage.mobile &&
  /home/vagrant/fdroidserver/fdroid lint talk.mirage.mobile
'
```

These passed for the final recipe.

## Build command

Run the full local F-Droid build inside a persistent terminal, because it takes a while:

```bash
cd /home/vagrant/fdroiddata-work
/home/vagrant/fdroidserver/fdroid build -v -l talk.mirage.mobile
```

From host without an interactive shell:

```bash
docker exec mirage-fdroid bash -lc '
  cd /home/vagrant/fdroiddata-work &&
  /home/vagrant/fdroidserver/fdroid build -v -l talk.mirage.mobile
'
```

The successful clean build took about 32 minutes for the Gradle phase after the earlier dependency/toolchain issues had been fixed.

## Copy APK back to host

After success:

```bash
mkdir -p ../fdroiddata/unsigned

docker cp \
  mirage-fdroid:/home/vagrant/fdroiddata-work/unsigned/talk.mirage.mobile_1013.apk \
  ../fdroiddata/unsigned/talk.mirage.mobile_1013.apk

ls -lh ../fdroiddata/unsigned/talk.mirage.mobile_1013.apk
shasum -a 256 ../fdroiddata/unsigned/talk.mirage.mobile_1013.apk
```

Expected SHA256 for the successful local artifact:

```text
39d762e8a3112097af840d33a7d8f19e71fceb3276aa7a276457bce6d3fac8a4
```

## Final working metadata recipe

The successful metadata is in:

```text
../fdroiddata/metadata/talk.mirage.mobile.yml
```

and mirrored in:

```text
docs/fdroiddata/talk.mirage.mobile.yml
```

Important final recipe details:

### Toolchain installs

The final recipe installs in `sudo`:

- Node.js via apt (`nodejs`)
- OpenJDK 17 from Debian bookworm (`openjdk-17-jdk`)
- Bun `1.3.8` with sha256 verification

Java 17 is forced in the Gradle build command:

```text
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### Expo prebuild command

Use `bun x`, not `bunx`:

```bash
EXPO_NO_GIT_STATUS=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_FDROID=true \
  bun x expo prebuild --platform android --clean --no-install
```

`bunx` was not available reliably in the F-Droid/container environment.

### Build checkout package patch

The recipe mutates `package.json` in F-Droid's temporary build checkout, not in the app repo.

It does two important things:

1. Excludes native modules that should not be part of the F-Droid build:

   ```text
   expo-dev-client
   expo-dev-launcher
   expo-dev-menu
   expo-dev-menu-interface
   @sentry/react-native
   sentry-react-native
   expo-updates
   expo-updates-interface
   expo-eas-client
   ```

2. Forces Expo Android modules to build from source:

   ```js
   p.expo.autolinking.android.buildFromSource = ['.*']
   ```

Why this matters: F-Droid scanner removes Expo local Maven/prebuilt artifacts from `node_modules`. Without `buildFromSource`, Gradle tries to resolve removed local AAR/JAR artifacts and fails.

### React Compiler patch

The recipe patches the build checkout to disable React Compiler:

```js
reactCompiler: false
```

This reduces Metro/memory pressure in the constrained F-Droid container.

### Android SDK env and generated permissions

After prebuild, the recipe does:

```bash
chmod -R u=rwX,go=rX android
export ANDROID_HOME=$$SDK$$ ANDROID_SDK_ROOT=$$SDK$$
echo "sdk.dir=$$SDK$$" > android/local.properties
```

The permission fix avoids F-Droid scanner complaints about odd generated file modes.

### Scanner handling

`scandelete` removes generated/downloaded JS artifacts after scan:

```yaml
scandelete:
  - node_modules/
  - dist-test/
```

`scanignore` is used for build scripts/binaries that F-Droid scanner otherwise removes but Gradle needs, including:

```yaml
- node_modules/expo-modules-autolinking/scripts/android/autolinking_implementation.gradle
- node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
- node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
- node_modules/react-native/ReactAndroid/publish.gradle
```

It also ignores several React Native module `android/build.gradle` files that scanner flagged for unknown Maven repos; without these, Gradle project resolution failed for modules like `@react-native-community/netinfo`.

### Signing config

The generated Expo release build includes a signing config line that should not be used for F-Droid output.

The recipe removes it:

```bash
sed -i -e '/signingConfig /d' app/build.gradle
```

This lets F-Droid produce its unsigned APK and sign it later in the normal F-Droid pipeline.

### Gradle command that finally worked

The final build runs from generated `android/`:

```bash
cd android
```

It appends Gradle stability settings:

```properties
org.gradle.daemon=false
org.gradle.workers.max=1
org.gradle.vfs.watch=false
kotlin.compiler.execution.strategy=in-process
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8
```

Then builds:

```bash
EXPO_PUBLIC_FDROID=true NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024 \
  ANDROID_HOME=$$SDK$$ ANDROID_SDK_ROOT=$$SDK$$ \
  JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
  gradle :app:assembleRelease \
  --no-daemon --max-workers=1 -Dorg.gradle.vfs.watch=false \
  -x lintVitalRelease \
  -x lintVitalAnalyzeRelease \
  -x generateReleaseLintVitalReportModel \
  -x lintVitalReportRelease
```

The lint-vital exclusions are important. We hit two related failures:

1. `lintVitalReportRelease` failed because `generateReleaseLintVitalReportModel` had been excluded and the model file was missing.
2. A clean build still invoked `lintVitalRelease`, which then failed because the report files from `lintVitalReportRelease` were missing.

Excluding all four lint-vital tasks made the full F-Droid build succeed.

## How we got to the final recipe

These were the major blockers and fixes, in order:

1. **`bun` / `bunx` missing**
   - Installed Bun in metadata `sudo`.
   - Switched from `bunx` to `bun x`.

2. **Gradle needed real Node**
   - A `node -> bun` symlink was not enough.
   - Installed `nodejs` via apt.

3. **Java/toolchain mismatch**
   - Used OpenJDK 17 from Debian bookworm.
   - Forced `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` for Gradle.

4. **F-Droid scanner removed Expo/RN prebuilt artifacts**
   - Added `expo.autolinking.android.buildFromSource=[".*"]` in the temporary build checkout.
   - Added `scandelete: node_modules/`.

5. **Scanner removed build scripts Gradle still needed**
   - Added targeted `scanignore` entries for Expo autolinking/Core plugin scripts, Hermes compiler, RN publish script, and selected RN module `android/build.gradle` files.

6. **Native modules that should not be included caused failures**
   - Excluded dev-client/dev-menu, Sentry, Expo Updates, and EAS client from Expo autolinking in the build checkout.

7. **Generated Android file permissions looked suspicious to scanner**
   - Added `chmod -R u=rwX,go=rX android` after prebuild.

8. **Gradle/Metro resource pressure**
   - Disabled React Compiler in the build checkout.
   - Forced one Gradle worker, no daemon, no VFS watch, and higher Metaspace.

9. **Signing config not appropriate for F-Droid**
   - Removed generated `signingConfig` from `app/build.gradle`.

10. **AGP lint-vital failures near the end**
    - Excluded `lintVitalRelease`, `lintVitalAnalyzeRelease`, `generateReleaseLintVitalReportModel`, and `lintVitalReportRelease`.

11. **Output path mismatch**
    - Used wildcard output:

      ```yaml
      output: android/app/build/outputs/apk/release/*release*.apk
      ```

    - Final APK inside build tree was:

      ```text
      build/talk.mirage.mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk
      ```

    - F-Droid copied it to:

      ```text
      unsigned/talk.mirage.mobile_1013.apk
      ```

## Known warnings that did not block the successful build

Expo share intent warning:

```text
expo-share-intent: your Expo SDK version does not match requirements! v6.0.0 needs ^55, found 54.0.0
```

This did not block the F-Droid APK build. It is still worth resolving separately by pinning an Expo SDK 54-compatible version or upgrading to Expo SDK 55 later.

Metro also emitted warnings about `@noble/*` / `@scure/*` package exports fallback resolution. These did not block the build.

## Quick repeat checklist

From the app repo root:

```bash
# 1. Ensure fdroiddata has the working metadata
cd ../fdroiddata
git checkout talk.mirage.mobile
git diff -- metadata/talk.mirage.mobile.yml

# 2. Ensure container is running
docker ps --filter name=mirage-fdroid || docker start mirage-fdroid

# 3. Sync metadata into container-local fdroiddata copy
cd ../mirage-mobile-app
docker cp ../fdroiddata/metadata/talk.mirage.mobile.yml \
  mirage-fdroid:/home/vagrant/fdroiddata-work/metadata/talk.mirage.mobile.yml

docker exec -u root mirage-fdroid bash -lc \
  'chown vagrant:vagrant /home/vagrant/fdroiddata-work/metadata/talk.mirage.mobile.yml'

# 4. Validate metadata
docker exec mirage-fdroid bash -lc '
  cd /home/vagrant/fdroiddata-work &&
  /home/vagrant/fdroidserver/fdroid readmeta &&
  /home/vagrant/fdroidserver/fdroid rewritemeta talk.mirage.mobile &&
  /home/vagrant/fdroidserver/fdroid lint talk.mirage.mobile
'

# 5. Build
docker exec mirage-fdroid bash -lc '
  cd /home/vagrant/fdroiddata-work &&
  /home/vagrant/fdroidserver/fdroid build -v -l talk.mirage.mobile
'

# 6. Copy artifact back
docker cp \
  mirage-fdroid:/home/vagrant/fdroiddata-work/unsigned/talk.mirage.mobile_1013.apk \
  ../fdroiddata/unsigned/talk.mirage.mobile_1013.apk
```

## Before opening the F-Droid MR

Do not open/submit without user approval.

Recommended checks before MR:

```bash
cd ../fdroiddata
git status --short
git diff -- metadata/talk.mirage.mobile.yml
```

Then verify in the container one more time:

```bash
docker exec mirage-fdroid bash -lc '
  cd /home/vagrant/fdroiddata-work &&
  /home/vagrant/fdroidserver/fdroid readmeta &&
  /home/vagrant/fdroidserver/fdroid lint talk.mirage.mobile
'
```

Commit only the metadata changes intended for the F-Droid MR, not local APK artifacts unless explicitly needed. The generated APK under `../fdroiddata/unsigned/` is a local build artifact.
