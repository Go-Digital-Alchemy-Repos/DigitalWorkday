# Digital Workday for Mac

Native macOS 14+ task companion for the Digital Workday backend. It provides a focused task window, menu-bar timer and quick add, browser-based PKCE authentication, realtime reconciliation, Keychain credential storage, and an encrypted read-only cache.

## Local development

1. Apply migration `0054_desktop_companion.sql` and set `DESKTOP_API_ENABLED=true` on the staging service.
2. Install full Xcode and select it with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
3. Run `./script/build_and_run.sh --run`, or use the Codex environment actions.

All builds use `https://digitalworkday.ai`. Authentication returns through `digitalworkday://auth/callback`.

## Distribution

`script/package_macos.sh` requires `DEVELOPER_ID_APPLICATION`, `SPARKLE_PUBLIC_KEY`, and a `NOTARY_KEYCHAIN_PROFILE`. It builds with the hardened runtime, signs, submits to Apple notarization, staples the ticket, and creates `dist/DigitalWorkday-notarized.zip`. Generate and publish a signed Sparkle appcast separately after the notarized archive is produced.

The committed Sparkle public key is deliberately a release placeholder. Never ship until it is replaced by the CI-injected signing key.
