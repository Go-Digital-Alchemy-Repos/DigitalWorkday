#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/macos/dist/DigitalWorkday.app"
DOWNLOAD_DIR="$ROOT_DIR/client/public/downloads/macos"
ARCHIVE_PATH="$DOWNLOAD_DIR/DigitalWorkday.zip"
CHECKSUM_PATH="$DOWNLOAD_DIR/DigitalWorkday.zip.sha256"
IDENTITY="${MACOS_SIGNING_IDENTITY:-}"
NOTARY_PROFILE="${MACOS_NOTARY_PROFILE:-}"
RELEASE_ARCHS="${MACOS_RELEASE_ARCHS:-arm64 x86_64}"

BUILD_CONFIG=release SWIFT_DISABLE_SANDBOX=1 SWIFT_ARCHS="$RELEASE_ARCHS" SKIP_ADHOC_SIGNING=1 MACOS_APP_DIR="$APP_DIR" \
  "$ROOT_DIR/script/build_and_run.sh" --build-only

if [ -n "$IDENTITY" ]; then
  # Notarization validates every executable in the archive. Re-sign Sparkle's
  # nested helpers inside-out so they all use our Developer ID identity,
  # hardened runtime, and a secure timestamp before signing the framework and
  # finally the application bundle.
  SPARKLE_VERSION_DIR="$APP_DIR/Contents/Frameworks/Sparkle.framework/Versions/B"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" \
    "$SPARKLE_VERSION_DIR/XPCServices/Downloader.xpc"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" \
    "$SPARKLE_VERSION_DIR/XPCServices/Installer.xpc"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" \
    "$SPARKLE_VERSION_DIR/Updater.app"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" \
    "$SPARKLE_VERSION_DIR/Autoupdate"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" \
    "$APP_DIR/Contents/Frameworks/Sparkle.framework"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$APP_DIR"
else
  codesign --force --deep --sign - "$APP_DIR"
  echo "Created an ad-hoc signed preview because MACOS_SIGNING_IDENTITY is not configured." >&2
fi

codesign --verify --deep --strict --verbose=2 "$APP_DIR"
mkdir -p "$DOWNLOAD_DIR"

package_archive() {
  rm -f "$ARCHIVE_PATH"
  ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ARCHIVE_PATH"
}

package_archive

if [ -n "$IDENTITY" ] && [ -n "$NOTARY_PROFILE" ]; then
  xcrun notarytool submit "$ARCHIVE_PATH" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP_DIR"
  spctl -a -vv -t exec "$APP_DIR"
  package_archive
fi

shasum -a 256 "$ARCHIVE_PATH" | awk '{ print $1 "  DigitalWorkday.zip" }' > "$CHECKSUM_PATH"
file "$APP_DIR/Contents/MacOS/DigitalWorkday"
du -h "$ARCHIVE_PATH"
cat "$CHECKSUM_PATH"
