#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/dist/DigitalWorkday.app"
: "${DEVELOPER_ID_APPLICATION:?Set DEVELOPER_ID_APPLICATION to the Developer ID certificate name}"
: "${SPARKLE_PUBLIC_KEY:?Set SPARKLE_PUBLIC_KEY}"
: "${NOTARY_KEYCHAIN_PROFILE:?Set NOTARY_KEYCHAIN_PROFILE created with notarytool store-credentials}"

BUILD_CONFIG=release "$ROOT_DIR/script/build_and_run.sh" --build-only
/usr/libexec/PlistBuddy -c "Set :SUPublicEDKey $SPARKLE_PUBLIC_KEY" "$APP_DIR/Contents/Info.plist"
codesign --force --deep --options runtime --timestamp --sign "$DEVELOPER_ID_APPLICATION" "$APP_DIR"
codesign --verify --deep --strict --verbose=2 "$APP_DIR"
spctl --assess --type execute --verbose=2 "$APP_DIR"

ditto -c -k --keepParent "$APP_DIR" "$ROOT_DIR/dist/DigitalWorkday.zip"
xcrun notarytool submit "$ROOT_DIR/dist/DigitalWorkday.zip" --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" --wait
xcrun stapler staple "$APP_DIR"
xcrun stapler validate "$APP_DIR"
ditto -c -k --keepParent "$APP_DIR" "$ROOT_DIR/dist/DigitalWorkday-notarized.zip"
