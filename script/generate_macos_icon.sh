#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SVG_PATH="${1:-$ROOT_DIR/macos/DigitalWorkday/Resources/DigitalWorkday_App_Icon_Accurate.svg}"
OUTPUT_PATH="$ROOT_DIR/macos/DigitalWorkday/Resources/DigitalWorkday.icns"
WORK_DIR="$(mktemp -d /tmp/digitalworkday-icon.XXXXXX)"
ICONSET_DIR="$WORK_DIR/DigitalWorkday.iconset"

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

mkdir -p "$ICONSET_DIR"
qlmanage -t -s 1024 -o "$WORK_DIR" "$SVG_PATH" >/dev/null
SOURCE_PNG="$WORK_DIR/$(basename "$SVG_PATH").png"

if [ ! -f "$SOURCE_PNG" ]; then
  echo "Unable to render $SVG_PATH" >&2
  exit 1
fi

make_icon() {
  local pixels="$1"
  local filename="$2"
  sips -z "$pixels" "$pixels" "$SOURCE_PNG" --out "$ICONSET_DIR/$filename" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
cp "$SOURCE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_PATH"
echo "Generated $OUTPUT_PATH from $SVG_PATH"
