# Digital Workday Desktop App Handoff

## Purpose and current production state

The Mac client is a focused desktop companion to the Digital Workday web application, not a second backend or a full copy of the website. Railway/Postgres remains the source of truth.

Current production release:

| Item | Value |
|---|---|
| Display name | Digital Workday |
| Bundle ID | `ai.digitalworkday.macos` |
| Minimum macOS | 14.0 |
| Version | 1.2.2 |
| Build | 6 |
| Production API | `https://digitalworkday.ai` |
| Callback | `digitalworkday://auth/callback` |
| Download | `https://digitalworkday.ai/downloads/macos/DigitalWorkday.zip` |
| Sparkle feed | `https://digitalworkday.ai/downloads/macos/appcast.xml` |
| Railway project | `6394b947-d38a-4539-8c51-bcea5f51e835` |
| Railway application service | `10455945-45f2-4e73-991d-ba009ddc85b4` |

As of this handoff, the web header button points to the cache-busted production ZIP and the live archive identifies itself as 1.2.2 build 6.

## Architecture

```text
SwiftUI Mac app
  ├─ browser PKCE authorization ──> /desktop/authorize
  ├─ bearer API requests ─────────> /api/v1/desktop/*
  ├─ authenticated avatar files ──> /api/v1/files/serve/*
  ├─ realtime reconciliation ─────> Socket.IO
  ├─ credentials ─────────────────> macOS Keychain
  ├─ offline snapshot ────────────> encrypted Application Support cache
  └─ updates ─────────────────────> Sparkle appcast + signed ZIP

Express/Railway
  ├─ desktop authorization and rotating sessions
  ├─ tenant/workspace-scoped desktop facade
  ├─ existing task/time/notification storage
  ├─ Postgres
  └─ object storage / authenticated file proxy
```

Important server code:

- `server/features/desktop/desktopPublic.routes.ts` — browser authorization and token exchange/revocation
- `server/features/desktop/desktopAuth.middleware.ts` — bearer-token authentication
- `server/features/desktop/desktop.router.ts` — profile, Today, notifications, task and timer facade
- `server/features/desktop/desktopContracts.ts` and `shared/desktopContracts.ts` — stable DTO contracts
- `server/realtime/socket.ts` — desktop bearer Socket.IO authentication
- `server/http/domains/fileServe.router.ts` — authenticated avatar/file serving
- `migrations/0054_desktop_companion.sql` — desktop auth/session tables

## Product scope implemented

- Today dashboard with overdue/today tasks, tracked time, and agenda
- Task and Upcoming navigation with adaptive wide/medium/compact layouts
- Task detail editing, rich text, status, priority, project conversion, due date, assignees, and estimates
- Comments, subtasks, completion, timers, and manual time entry
- Notification inbox and unread state
- Quick Add and command bar
- Account/profile settings with avatar management
- System/Light/Dark appearance, Always on Top, Launch at Login, menu-bar controls
- Keychain authentication, encrypted read-only cache, reconnect refresh, and conflict handling
- Developer ID signing, Apple notarization, Sparkle feed, and website download

Deferred by design: full chat, project/client administration, reporting, full calendar editing, attachments/tags/history, and offline mutations.

## New workstation setup

### 1. Repository and toolchain

```bash
git clone https://github.com/Go-Digital-Alchemy-Repos/DigitalWorkday.git
cd DigitalWorkday
npm install
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
swift package resolve --package-path macos/DigitalWorkday
swift test --package-path macos/DigitalWorkday
./script/build_and_run.sh --run
```

Use a local `.env` copied from `.env.example` for web/server development. Never transfer the production `.env` through Git.

### 2. Apple signing identity

The receiving workstation needs the **Developer ID Application certificate plus its associated private key**. A downloaded `.cer` alone is insufficient.

On the current signing Mac, export the identity from Keychain Access as a password-protected `.p12`. Transfer it and its password through an approved secure channel, import it on the receiving Mac, then verify:

```bash
security find-identity -v -p codesigning
```

Expected production identity at the time of handoff:

```text
Developer ID Application: Digital Alchemy, LLC (U.S.) (P7HUUF3EN2)
```

Do not commit the `.p12`, its password, certificates, or private keys.

### 3. Apple notarization

Create a Keychain notary profile on the receiving workstation. Either use an Apple ID/app-specific password flow or an App Store Connect API key authorized for the team. Example profile name used by the release script:

```text
DigitalWorkdayNotary
```

Verify the profile by packaging a release or with `xcrun notarytool history --keychain-profile DigitalWorkdayNotary`.

The App Store Connect `.p8`, issuer ID, key ID, Apple ID, app-specific password, and team credentials must be transferred securely and must not enter the repository or chat logs.

### 4. Sparkle update signing

`Info.plist` contains only the Sparkle **public** EdDSA key. The receiving workstation or CI needs the matching Sparkle private key in its local Keychain so `generate_appcast` can sign releases.

Transfer/import the Sparkle private key through a secure secret channel. Confirm that a generated appcast signature validates against `SUPublicEDKey` in `Config/Info.plist`. Never rotate this key casually: existing installations trust the committed public key.

### 5. Railway and GitHub access

- GitHub: organization/repository write access to `Go-Digital-Alchemy-Repos/DigitalWorkday`
- Railway: access to project `6394b947-d38a-4539-8c51-bcea5f51e835`
- Production service: `10455945-45f2-4e73-991d-ba009ddc85b4`
- Production variable `DESKTOP_API_ENABLED=true`
- Production migrations applied through at least `0054_desktop_companion.sql`

Railway, database, storage, Google OAuth, and application encryption values remain provider secrets. Recreate CLI authentication on the new workstation; do not copy raw tokens into the repo.

## Development verification

Run before handoff or release:

```bash
npm run check
npx vitest run server/tests/desktop-contract.test.ts server/tests/file-serve-security.test.ts
swift test --package-path macos/DigitalWorkday
./script/build_and_run.sh --verify
```

Authenticated visual QA should cover:

- login callback and session refresh
- Today, Tasks, Upcoming, Notifications
- wide, medium, and compact windows
- task selection and detail loading
- rich-text display/edit/save
- personal-to-project conversion
- profile and assignee avatars at every size
- timer and time-entry operations
- Light/Dark/System appearance
- menu-bar symbol and menu-bar controls
- offline read-only state and reconnect

## Production release procedure

1. Bump version/build in `macos/DigitalWorkday/Config/Info.plist`.
2. Change the download cache-buster in `client/src/routing/tenantRouter.tsx`.
3. Run the development verification commands.
4. Package and notarize:

   ```bash
   MACOS_SIGNING_IDENTITY='Developer ID Application: Digital Alchemy, LLC (U.S.) (P7HUUF3EN2)' \
   MACOS_NOTARY_PROFILE='DigitalWorkdayNotary' \
   ./script/package_macos.sh
   ```

5. Generate the signed feed:

   ```bash
   macos/DigitalWorkday/.build/artifacts/sparkle/Sparkle/bin/generate_appcast \
     client/public/downloads/macos
   ```

6. While the download filename is mutable, remove older feed items that point to the same ZIP URL; only the newest signature matches the overwritten archive.
7. Commit the ZIP, checksum, appcast, source, tests, and version/cache-buster changes.
8. Push and deploy the same commit to Railway production.
9. Verify production:

   ```bash
   curl -fsS https://digitalworkday.ai/health
   curl -fsS 'https://digitalworkday.ai/downloads/macos/DigitalWorkday.zip?release-check=1' \
     -o /tmp/DigitalWorkday-production.zip
   shasum -a 256 /tmp/DigitalWorkday-production.zip
   curl -fsS https://digitalworkday.ai/downloads/macos/appcast.xml
   ```

10. Expand the ZIP and inspect `DigitalWorkday.app/Contents/Info.plist`; compare the remote hash with `DigitalWorkday.zip.sha256`.
11. On a clean Mac, verify Gatekeeper installation and the Sparkle update path.

## Release artifacts and secret boundary

Committed and safe to share:

- source code and tests
- SVG/ICNS public artwork
- notarized application ZIP
- SHA-256 checksum
- Sparkle appcast and public key
- build/package scripts and documentation

Never commit or attach:

- `.env` files or production environment values
- Developer ID private key or exported `.p12`
- `.p12` password
- App Store Connect `.p8` private key
- Apple ID or app-specific password
- Sparkle EdDSA private key
- Railway/GitHub/database/storage access tokens

## Current release verification values

For 1.2.2 build 6:

```text
DigitalWorkday.zip size: 3770001 bytes
SHA-256: cd638b2099fdc564a2db6120a47502c32e97a73db4152d778b30c4caa9934fc8
Apple notarization submission: 5ba15ce6-cc0b-43ab-8bc4-d24ec1a64687
Railway deployment: 9511f70f-34b9-48b9-8807-e67ae6f3579c
```

These values are release-specific and should be updated with every production build.
