# F-Droid Build Handoff Notes

This document captures the current F-Droid submission/build investigation for Mirage Mobile (`talk.mirage.mobile`) so another session/machine can continue from the same context.

## Goal

Publish the Expo-managed React Native app to F-Droid without committing generated native folders (`/android`, `/ios`) to the app source repo.

The intended approach is:

1. F-Droid clones the app repo.
2. F-Droid installs JS dependencies with Bun.
3. F-Droid runs Expo prebuild for Android only.
4. F-Droid builds the generated Android project with Gradle.
5. The generated native project is temporary and not committed to the app repo.

## Current app source state

App repo: `MirageFoundation/mirage-mobile-app`

Current release tag used by F-Droid metadata:

```text
v1.0.13 -> 74def030241be346e6fd4dbb0ce7b0b9f0563d04
```

Important app-side changes already made/pushed:

- Added GPL-3.0-or-later `LICENSE`.
- Added F-Droid/Fastlane metadata and screenshots.
- Added deterministic Android version code:
  - `versionName: 1.0.13`
  - `versionCode: 1013`
- Added F-Droid build flag:
  - `src/config/build-flags.ts`
  - exports `IS_FDROID_BUILD = process.env.EXPO_PUBLIC_FDROID === "true"`
- Fixed `.gitignore`:
  - root `/android` is ignored
  - `fastlane/metadata/android/**` is unignored/tracked
  - `/build-*` is root-anchored so it does not ignore `src/config/build-flags.ts`
- F-Droid mode disables or skips:
  - Sentry runtime/plugin behavior
  - Google services file
  - Expo OTA updates
  - EAS update checks
- Upgraded native dependencies to help F-Droid source build:
  - `react-native-unistyles` to `3.2.4`
  - `react-native-nitro-modules` to `0.35.4`

Local JS bundle check passed in the app repo:

```bash
EXPO_PUBLIC_FDROID=true bun x expo export --platform android --output-dir dist-test
```

## fdroiddata fork/branch

Fork:

```text
https://gitlab.com/miragellc/fdroiddata
```

Local path used in this session:

```text
/Users/sonali/dev/mirage/fdroiddata
```

Branch:

```text
talk.mirage.mobile
```

Metadata file:

```text
metadata/talk.mirage.mobile.yml
```

The metadata is not yet final/MR-ready. It contains many local uncommitted fixes.

## Key F-Droid metadata recipe pieces

The build recipe needs pinned toolchain installs because local/F-Droid buildserver image did not provide all needed versions by default:

- Temurin JDK 17
- Node.js `22.21.1`
- Bun `1.3.8`
- Android command-line tools `commandlinetools-linux-13114758_latest.zip`
- Android SDK packages:
  - `platforms;android-35`
  - `build-tools;36.0.0`
  - `ndk;27.0.12077973`
  - `ndk;27.1.12297006`

Important metadata concepts/fixes:

### Bun command

Use:

```bash
bun x expo prebuild --platform android --no-install
```

not `bunx`, because `bunx` was not available in the F-Droid/container environment.

### Android SDK env

Set SDK env and write `local.properties` after prebuild:

```bash
export ANDROID_HOME=$$SDK$$
export ANDROID_SDK_ROOT=$$SDK$$
echo "sdk.dir=$$SDK$$" > android/local.properties
```

Do **not** force `ndk.dir` to a single NDK. Some generated modules need different NDK versions. Install both NDKs and let Gradle choose by `ndkVersion`.

### Modern sdkmanager

The old `/opt/android-sdk/tools/bin/sdkmanager` failed under modern Java with JAXB-related errors. Install/use modern command-line tools:

```text
$$SDK$$/cmdline-tools/latest/bin/sdkmanager
```

When using `yes | sdkmanager` under `set -o pipefail`, temporarily disable pipefail:

```bash
set +o pipefail
yes | $$SDK$$/cmdline-tools/latest/bin/sdkmanager ...
set -o pipefail
```

Otherwise `yes` can exit with SIGPIPE after sdkmanager finishes, failing the command.

### Expo/RN autolinking patch

The F-Droid prebuild currently patches `package.json` in the build checkout to configure Expo autolinking:

```js
expo.autolinking.android.buildFromSource = ['.*']
```

This was needed because F-Droid scanner removes Expo local Maven AAR/JAR artifacts from `node_modules/*/local-maven-repo`, and then Gradle cannot resolve those Expo modules unless they are built from source.

The same patch excludes native modules that should not be in the F-Droid build:

```text
expo-dev-client
expo-dev-launcher
expo-dev-menu
@sentry/react-native
sentry-react-native
expo-updates
expo-updates-interface
expo-eas-client
```

Rationale:

- `expo-dev-client`/launcher/menu caused Gradle project errors and are not needed for release.
- Sentry was disabled at runtime but still autolinked natively; F-Droid scanner removed Sentry JARs and Gradle failed.
- `expo-updates` was disabled in app config, but still compiled natively and failed at `:expo-updates:compileReleaseKotlin`. It is safer to exclude it completely for F-Droid.

### React Compiler

Disable React Compiler for F-Droid build to reduce Metro/memory pressure:

```js
reactCompiler: false
```

Current recipe patches `app.config.ts` in the build checkout.

### Generated Android permissions

Expo/Bun generated Android files with suspicious permissions in the container. F-Droid scanner rejected them as `100200` permissions.

Fix after prebuild:

```bash
chmod -R u=rwX,go=rX android
```

### Gradle stability flags

To reduce daemon/resource issues in the container:

```properties
org.gradle.daemon=false
org.gradle.workers.max=1
org.gradle.vfs.watch=false
kotlin.compiler.execution.strategy=in-process
org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8
```

Build command used:

```bash
EXPO_PUBLIC_FDROID=true NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024 \
  ANDROID_HOME=$$SDK$$ ANDROID_SDK_ROOT=$$SDK$$ JAVA_HOME=/opt/jdk17 \
  gradle assembleRelease --no-daemon --max-workers=1 -Dorg.gradle.vfs.watch=false
```

### Unistyles patch

`react-native-unistyles` failed during C++ compilation with duplicate `Parser` definitions:

```text
error: redefinition of 'Parser'
node_modules/react-native-unistyles/android/../cxx/parser/Parser.h
node_modules/react-native-unistyles/cxx/parser/Parser.h
```

Upgrading Unistyles/Nitro helped but did not eliminate it. The F-Droid recipe injects a classic include guard into:

```text
node_modules/react-native-unistyles/cxx/parser/Parser.h
```

This is build-checkout-only and not committed to the app source.

### Hermes

Do **not** assume Hermes must be disabled.

Research/findings:

- React Native docs say Hermes is default, but JSC is still possible.
- Expo docs say Hermes is default and fully supported, but `jsEngine` can be switched.
- Existing F-Droid RN metadata has precedent for keeping Hermes by adding scanner ignore for `hermesc`.

F-Droid scanner removed:

```text
node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
```

Then Gradle failed during JS bundling because it needed that binary.

Fix added to `scanignore`:

```yaml
scanignore:
  - node_modules/react-native/sdks/hermesc/linux64-bin/hermesc
```

This is based on existing `fdroiddata` precedent, e.g. `dev.djara.wafrn_rn.yml` has the same ignore.

## Current known build status

The latest full `fdroid build` did **not** produce an APK.

The important result was:

```text
Build completed at 2026-05-07 12:23:59Z
No apks match build/talk.mirage.mobile/android/app/build/outputs/apk/release/app-release.apk
```

There was no APK under:

```text
unsigned/
build/talk.mirage.mobile/android/app/build/**/*.apk
```

Only outputs found:

```text
build/talk.mirage.mobile/android/app/build/outputs/logs/manifest-merger-release-report.txt
build/talk.mirage.mobile/android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

So the current blocker is **not** scanner/native/Kotlin/Metro anymore. It is:

```text
Gradle/F-Droid build command completes enough for F-Droid to say "Build completed", but no APK is emitted at the configured output path.
```

Needs further investigation.

## Important caution: persistent Docker setup

Earlier attempts used throwaway Docker:

```bash
docker run --rm ...
```

That redownloaded JDK/Node/Bun/SDK/NDK every run. For iterative debugging, use a persistent container.

Persistent container created in this session:

```text
mirage-fdroid-build
```

It runs:

```text
sleep infinity
```

and has the toolchain installed.

Verify:

```bash
docker ps --filter name=mirage-fdroid-build

docker exec mirage-fdroid-build bash -lc '
  export ANDROID_HOME=/opt/android-sdk
  export JAVA_HOME=/opt/jdk17
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  /opt/jdk17/bin/java -version
  node --version
  bun --version
  sdkmanager --list_installed | grep -E "platforms;android-35|build-tools;36.0.0|ndk;27"
'
```

Expected installed versions:

```text
JDK 17.0.19
Node v22.21.1
Bun 1.3.8
platforms;android-35
build-tools;36.0.0
ndk;27.0.12077973
ndk;27.1.12297006
```

Why terminals may disappear:

- `docker exec <container> <command>` exits when `<command>` finishes.
- That does **not** mean the persistent Docker container died.
- For a terminal that stays open, start an interactive shell:

```bash
docker exec -it mirage-fdroid-build bash
```

Then run commands inside that shell.

## Local helper scripts created

In `/Users/sonali/dev/mirage/fdroiddata`:

```text
setup-mirage-fdroid-container.sh
run-mirage-fdroid-local.sh
run-mirage-fdroid-build-persistent.sh
```

These are local debugging helpers and are not intended for the upstream MR as-is.

## Current issue to debug next

Need determine why `assembleRelease` does not produce an APK.

Recommended next steps:

1. Ensure no orphaned Gradle processes are running inside the persistent container:

   ```bash
   docker exec mirage-fdroid-build bash -lc "pkill -f 'gradle|GradleDaemon' || true"
   ```

2. Open an interactive container shell:

   ```bash
   docker exec -it mirage-fdroid-build bash
   ```

3. Go to the generated Android project:

   ```bash
   cd /build/build/talk.mirage.mobile/android
   export ANDROID_HOME=/opt/android-sdk
   export ANDROID_SDK_ROOT=/opt/android-sdk
   export JAVA_HOME=/opt/jdk17
   export PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH
   ```

4. Run targeted Gradle output checks:

   ```bash
   gradle :app:tasks --all --no-daemon --max-workers=1 --console=plain > /build/tasks.log 2>&1
   grep -E 'assembleRelease|packageRelease|bundleRelease|installRelease' /build/tasks.log
   ```

5. Run direct assemble and capture output:

   ```bash
   EXPO_PUBLIC_FDROID=true NODE_ENV=production NODE_OPTIONS=--max-old-space-size=1024 \
     gradle :app:assembleRelease --no-daemon --max-workers=1 \
     -Dorg.gradle.vfs.watch=false --console=plain --stacktrace --info \
     > /build/direct-gradle-assemble.log 2>&1

   echo $?
   find app/build/outputs -type f | sort
   find app/build -type f -name '*.apk' -o -name '*.aab'
   ```

6. If direct Gradle produces APK in a different path, update metadata `output:` accordingly.

7. If `assembleRelease` does not run package tasks, inspect generated Gradle configuration:

   ```bash
   grep -R "applicationVariants\|androidComponents\|splits\|packageRelease\|assembleRelease\|outputs" \
     app/build.gradle build.gradle gradle.properties
   ```

8. If Gradle is only producing native symbols and no APK, check if a task dependency or Android Gradle Plugin behavior is altered by the F-Droid `gradle` wrapper/shim. Try explicit package task if present:

   ```bash
   gradle :app:packageRelease --no-daemon --max-workers=1 --stacktrace --info
   ```

## If another machine gets stuck earlier, e.g. at `expo-crypto`

That likely means it is replaying an earlier source-build phase where F-Droid scanner removed Expo local Maven artifacts and Gradle is compiling Expo modules from source.

Things to check:

1. Confirm the metadata patch includes:

   ```js
   buildFromSource: ['.*']
   ```

2. Confirm `scanignore` includes at least:

   ```yaml
   - node_modules/expo-modules-autolinking/scripts/android/autolinking_implementation.gradle
   - node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
   ```

3. Confirm the generated build is not trying to use removed AARs from `local-maven-repo`.

4. Confirm SDK/NDK/JDK are installed and env vars are set.

5. Confirm Gradle resource limits are applied (`workers.max=1`, no daemon, vfs watch off).

## MR status

No upstream F-Droid MR has been opened yet.

Do not open the MR until:

- `fdroid lint talk.mirage.mobile` passes
- `fdroid build -v -l -t --no-tarball --no-refresh talk.mirage.mobile` produces an APK
- `metadata/talk.mirage.mobile.yml` is committed/pushed on the `talk.mirage.mobile` branch
- user explicitly approves opening the MR
