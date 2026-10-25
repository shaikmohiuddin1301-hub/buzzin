# Native shell and mobile builds

## What this is, precisely

`android/` and `ios/` are **Capacitor shells** around the deployed Next.js application. The
shell opens the production URL in a WebView; it does not contain a copy of the app.

That is a deliberate constraint, not a shortcut. BuildTogether's pages are React Server
Components and every mutation is a server action bound to the server's SQLite database. A
static bundle cannot exist for this app, so a shell cannot ship offline screens or native
components without a second client written against a JSON API that does not exist yet.

What the shell does give you:

- a real installable app on Android (APK) with its own icon, splash and app id;
- a persistent WebView session, so sign-in survives app restarts;
- full-screen layout with safe-area handling from the web app itself;
- an explicit offline page (`www/index.html`) instead of a blank screen.

What it does **not** give you: native navigation, native gestures, offline data, push
notifications, or App Store approval by default. Apple rejects apps that are only a website
under guideline 4.2 unless they add native value. A genuinely native client means a React
Native (or Swift/Kotlin) app plus a JSON API in this backend — a separate project.

## Configuration

`capacitor.config.ts` points the shell at:

```
https://buildtogether-e6cb.onrender.com   (default)
```

Override without touching code by setting the repository variable
`BUILDTOGETHER_APP_URL` (Settings → Secrets and variables → Actions → Variables). Only
`https://` origins are used; `cleartext` is disabled.

App id: `com.buildtogether.app`. Changing it later changes the store listing identity, so
decide before publishing.

## CI: `.github/workflows/mobile.yml`

Runs on every push to `main` (docs and markdown changes are skipped), on pull requests and on
manual dispatch. Two jobs, both uploading artifacts for 30 days:

| Job | Runner | Output |
| --- | --- | --- |
| Android APK | `ubuntu-latest`, Node 22, JDK 21 | `app-debug.apk` — installable, signed with the debug keystore |
| iOS (simulator) | `macos-latest`, Node 22, Xcode | `buildtogether-ios-simulator.zip` — unsigned, runs in the Simulator only |

The APK needs no secrets: download the artifact, transfer it to a device, allow installation
from unknown sources, install.

## Signing: what is required for real distribution

**Android release** — create a keystore once and store it as secrets:

```bash
keytool -genkeypair -v -keystore release.keystore -alias buildtogether \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # → ANDROID_KEYSTORE_BASE64
```

Add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD` as repository secrets, then add a release job that decodes the keystore
and runs `./gradlew assembleRelease` with those values in `android/keystore.properties`.
Without this, only debug builds exist — that is what this repository produces today.

**iOS device / TestFlight** — requires an Apple Developer Program membership (paid). You need:

1. a distribution certificate (`.p12`) and its password;
2. a provisioning profile for `com.buildtogether.app`;
3. an App Store Connect API key (issuer id, key id, `.p8`);
4. a macOS runner step that imports the certificate into a temporary keychain, installs the
   profile and runs `xcodebuild -exportArchive`.

Those four values belong in repository secrets and nowhere else. Until they exist, CI can only
build the simulator app. I have not configured signing, because it needs your Apple account —
claiming a signed IPA would be false.

## Local builds

Capacitor 8 requires Node 22 (the web app itself still runs on Node 18.18+):

```bash
npm ci
npx cap sync android      # copies www/ and writes the native config
# Android Studio → open android/ → Run, or:
cd android && ./gradlew assembleDebug
```

iOS needs macOS with Xcode 16+:

```bash
npm ci
npx cap sync ios
open ios/App/App.xcodeproj     # or: xcodebuild -scheme App -sdk iphonesimulator build
```

`www/index.html` is the offline fallback. `npx cap sync` overwrites the copied web assets in
the native projects, so never edit those copies.

## Store checklist (not done)

- app icon and splash (replace Capacitor defaults in `android/app/src/main/res` and
  `ios/App/App/Assets.xcassets`)
- Android `versionCode`/`versionName`, iOS `CFBundleShortVersionString`/build number
- privacy policy URL and App Store privacy answers (the app collects accounts and uploads)
- account deletion inside the app — the web app has it under Settings → Account
- review notes explaining what the app does beyond a website, if you submit the shell
