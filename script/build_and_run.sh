#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/macos/DigitalWorkday"
APP_DIR="$ROOT_DIR/dist/DigitalWorkday.app"
BUILD_CONFIG="${BUILD_CONFIG:-debug}"
MODE="${1:---run}"

# Ensure macOS cannot keep an older executable alive when the bundle is rebuilt.
pkill -x DigitalWorkday 2>/dev/null || true
for _ in {1..20}; do
  pgrep -x DigitalWorkday >/dev/null || break
  sleep 0.1
done

swift build --package-path "$PACKAGE_DIR" --configuration "$BUILD_CONFIG"
BIN_DIR="$(swift build --package-path "$PACKAGE_DIR" --configuration "$BUILD_CONFIG" --show-bin-path)"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Frameworks" "$APP_DIR/Contents/Resources"
cp "$PACKAGE_DIR/Config/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$PACKAGE_DIR/Resources/DigitalWorkday.icns" "$APP_DIR/Contents/Resources/DigitalWorkday.icns"
cp "$BIN_DIR/DigitalWorkday" "$APP_DIR/Contents/MacOS/DigitalWorkday"
if ! otool -l "$APP_DIR/Contents/MacOS/DigitalWorkday" | grep -q '@loader_path/../Frameworks'; then
  install_name_tool -add_rpath '@loader_path/../Frameworks' "$APP_DIR/Contents/MacOS/DigitalWorkday"
fi
if [ -d "$BIN_DIR/Sparkle.framework" ]; then
  ditto "$BIN_DIR/Sparkle.framework" "$APP_DIR/Contents/Frameworks/Sparkle.framework"
fi
codesign --force --deep --sign - "$APP_DIR"

case "$MODE" in
  --build-only) ;;
  --verify)
    codesign --verify --deep --strict --verbose=2 "$APP_DIR"
    open -n "$APP_DIR"
    for _ in {1..30}; do
      pgrep -x DigitalWorkday >/dev/null && exit 0
      sleep 0.1
    done
    echo "DigitalWorkday failed to launch" >&2
    exit 1
    ;;
  --run) open -n "$APP_DIR" ;;
  --logs)
    open -n "$APP_DIR"
    log stream --level info --predicate 'process == "DigitalWorkday"'
    ;;
  --telemetry)
    open -n "$APP_DIR"
    log stream --style compact --predicate 'subsystem == "ai.digitalworkday.macos"'
    ;;
  *) echo "Usage: $0 [--run|--build-only|--verify|--logs|--telemetry]" >&2; exit 2 ;;
esac
