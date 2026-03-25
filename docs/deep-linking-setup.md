# Deep Linking Setup

The mobile app supports Universal Links (iOS) and App Links (Android) for `mirage.talk` and `mirage.vote`.

When a user taps a Mirage link (e.g. `https://mirage.talk/p/abc123`):
- **App installed** → opens directly in the app
- **App not installed** → falls through to the website (which can show an "Open in App" banner or redirect to the store)

## Server-Side Requirements

Each Mirage node that should support deep linking must serve two files:

### iOS: `/.well-known/apple-app-site-association`

Serve at `https://<domain>/.well-known/apple-app-site-association` with `Content-Type: application/json` (no `.json` extension).

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.talk.mirage.mobile",
        "paths": [
          "/p/*",
          "/u/*",
          "/t/*",
          "/home",
          "/following",
          "/inbox",
          "/profile",
          "/search",
          "/search?*",
          "/topics",
          "/settings",
          "/subscription",
          "/agents",
          "/signup",
          "/signup?*",
          "/create_account?invite=*",
          "/create_account?ref=*"
        ]
      }
    ]
  }
}
```

> Replace `TEAM_ID` with the Apple Developer Team ID.

### Android: `/.well-known/assetlinks.json`

Serve at `https://<domain>/.well-known/assetlinks.json` with `Content-Type: application/json`.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "talk.mirage.mobile",
      "sha256_cert_fingerprints": [
        "SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

> Get the SHA-256 fingerprint from your signing key:
> ```
> keytool -list -v -keystore your-keystore.jks -alias your-alias
> ```
> Or from the Play Console under **Setup → App signing → SHA-256 certificate fingerprint**.

## App-Side Configuration

Already configured in `app.config.ts`:

- **iOS**: `associatedDomains: ["applinks:mirage.talk", "applinks:mirage.vote"]`
- **Android**: `intentFilters` with `autoVerify: true` for both domains

## Fallback for Non-Installed Users

If the app is not installed, the link opens in the browser. The web frontend should include:

### Smart App Banner (iOS Safari)
Add to `<head>` in the web frontend's `index.html`:
```html
<meta name="apple-itunes-app" content="app-id=YOUR_APP_STORE_ID, app-argument=https://mirage.talk">
```

### Android Intent Fallback
Android App Links with `autoVerify: true` handle this automatically. For additional coverage, add an "Open in App" banner or Play Store redirect on the web frontend.

## Supported Deep Link Routes

| Web URL | App Screen |
|---------|-----------|
| `/p/<id>` | Post detail |
| `/u/<id>` | User profile |
| `/t/<topic>` | Topic feed |
| `/home` | Home feed |
| `/following` | Following feed |
| `/inbox` | Inbox |
| `/profile` | Own profile |
| `/search?q=...` | Search |
| `/topics` | Topics listing |
| `/settings` | Settings |
| `/subscription` | Subscription |
| `/agents` | Agents |
| `/signup?ref=<username>` | Referral signup |
| `/signup?invite=<code>` | Invite code signup |
| `/create_account?invite=<code>` | Invite flow |

## Logged-Out Behavior

If the user is not logged in when a deep link arrives, the link is saved in `useDeepLinkStore`. The user sees the logged-out home screen and can log in or create an account. After authentication, the app automatically navigates to the deferred deep link destination.

## Rebuilding

After changing `app.config.ts`, you must rebuild the native apps:
```bash
bunx expo prebuild --clean
```
