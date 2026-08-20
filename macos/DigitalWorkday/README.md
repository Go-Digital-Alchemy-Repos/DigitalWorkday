# Digital Workday for Mac

Native macOS 14+ task companion for the Digital Workday production service. The app is a SwiftUI/Swift Package Manager executable with browser-based PKCE authentication, bearer-authenticated desktop APIs, Socket.IO reconciliation, Keychain credential storage, an encrypted read-only cache, a menu-bar extra, and Sparkle updates.

The current production release is **1.2.2 (build 6)**. The website download button and Sparkle feed both serve:

- `https://digitalworkday.ai/downloads/macos/DigitalWorkday.zip`
- `https://digitalworkday.ai/downloads/macos/appcast.xml`

See [Desktop App Handoff](../../docs/DESKTOP_APP_HANDOFF.md) for the full architecture, workstation-transfer, release, and production verification guide.

## Requirements

- macOS 14 or newer
- Full Xcode, selected with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- Swift 6 toolchain included with Xcode
- Node.js 20+ and npm for the shared web/server project
- A production Digital Workday employee/workspace account for authenticated QA

Distribution additionally requires an Apple Developer Program team, the Developer ID Application certificate **and its private key**, notarization credentials stored in Keychain, and the Sparkle EdDSA private key. Never commit any private key, `.p12`, App Store Connect `.p8`, password, or notarization credential.

## Local development

From the repository root:

```bash
npm install
swift package resolve --package-path macos/DigitalWorkday
swift test --package-path macos/DigitalWorkday
./script/build_and_run.sh --run
```

Useful modes are `--build-only`, `--verify`, `--run`, `--logs`, and `--telemetry`. The debug bundle is written to `dist/DigitalWorkday.app` unless `MACOS_APP_DIR` is supplied.

All current builds use `https://digitalworkday.ai`. Browser authentication returns through `digitalworkday://auth/callback`.

## Backend prerequisites

- Migration `migrations/0054_desktop_companion.sql` must be applied.
- `DESKTOP_API_ENABLED=true` must be set in the deployed service.
- Production must serve HTTPS and support Socket.IO/WebSockets.
- Avatar/file storage must be configured for authenticated file proxying.

Desktop routes live under `/api/v1/desktop`; the browser authorization entry point is `/desktop/authorize`.

## Build and package

Create an ad-hoc local preview:

```bash
./script/package_macos.sh
```

Create the distributable universal, Developer ID-signed, notarized build:

```bash
MACOS_SIGNING_IDENTITY='Developer ID Application: Company Name (TEAMID)' \
MACOS_NOTARY_PROFILE='DigitalWorkdayNotary' \
./script/package_macos.sh
```

The script builds `arm64` and `x86_64`, signs Sparkle helpers inside-out with hardened runtime and timestamps, signs the app, submits it to Apple, staples the accepted ticket, validates it with Gatekeeper, and writes:

- `macos/dist/DigitalWorkday.app`
- `client/public/downloads/macos/DigitalWorkday.zip`
- `client/public/downloads/macos/DigitalWorkday.zip.sha256`

Generate the signed Sparkle feed after packaging:

```bash
macos/DigitalWorkday/.build/artifacts/sparkle/Sparkle/bin/generate_appcast \
  client/public/downloads/macos
```

The current deployment uses one mutable archive URL. Keep only the latest `<item>` in `appcast.xml`; an older item pointing to the same overwritten ZIP would have a stale signature. A future release pipeline should retain versioned ZIP filenames if historical feed entries are desired.

## Release checklist

1. Update `CFBundleShortVersionString` and `CFBundleVersion` in `Config/Info.plist`.
2. Update the cache-busting query on `MACOS_APP_DOWNLOAD_URL` in `client/src/routing/tenantRouter.tsx`.
3. Run Swift tests and relevant server contract/security tests.
4. Run the signed/notarized package command above.
5. Generate `appcast.xml` and retain only its latest item while the archive URL remains mutable.
6. Deploy the repository to Railway production.
7. Download the production ZIP, compare SHA-256 and size, inspect its embedded `Info.plist`, and verify the production appcast version/signature.
8. Install on a second Mac and confirm Gatekeeper, login callback, task detail, avatars, timer, and Sparkle update behavior.

## Key source areas

- `App/DigitalWorkdayApp.swift` — scenes, commands, menu-bar item
- `Stores/AppStore.swift` — application state and mutations
- `Services/APIClient.swift` — desktop API and authenticated avatar requests
- `Views/ContentView.swift` — adaptive root layout
- `Views/TodayView.swift` — Today command center and task rows
- `Views/TaskDetailView.swift` — task editor and workflow sections
- `Views/AvatarView.swift` — constrained profile/assignee rendering
- `Support/DesignSystem.swift` — semantic visual tokens
- `Config/Info.plist` — version, callback scheme, Sparkle feed/public key
- `Resources/menuBarSymbol.svg` — template menu-bar symbol

## Security notes

- Access and refresh tokens are stored in macOS Keychain.
- Cached task data is encrypted and read-only when offline.
- The browser session authentication path remains separate from desktop bearer authentication.
- Task mutations use conflict checks and idempotency protection.
- Signing/notarization/Sparkle private credentials are workstation or CI secrets and are intentionally absent from Git.
