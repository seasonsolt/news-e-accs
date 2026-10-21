#!/usr/bin/env bash
# Export a dedicated portrait illustration, without making a landscape cut.
# Usage: REALESRGAN=/path/to/realesrgan-ncnn-vulkan bash tools/make-phone-wallpaper.sh SRC.png OUT.jpg
set -euo pipefail
SRC=${1:?portrait source required}
OUT=${2:?output JPEG required}
BIN=${REALESRGAN:-$(command -v realesrgan-ncnn-vulkan || true)}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FONT="$SCRIPT_DIR/../assets/og-fonts/noto-sans-sc-700.ttf"
[ -f "$SRC" ] && [ -x "$BIN" ] && [ -f "$FONT" ] || { echo 'source, upscaler or font missing' >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
"$BIN" -i "$SRC" -o "$TMP/x4.png" -n realesrgan-x4plus -m "$(dirname "$BIN")/models" >"$TMP/log" 2>&1 || true
[ -s "$TMP/x4.png" ] || { cat "$TMP/log" >&2; exit 1; }
ffmpeg -nostdin -loglevel error -y -i "$TMP/x4.png" \
  -vf "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,drawtext=fontfile='$FONT':text='e-acc.ai':fontcolor=white@0.55:fontsize=56:x=(w-tw)/2:y=h-th-260:shadowcolor=black@0.35:shadowx=2:shadowy=2,noise=alls=4:allf=t" \
  -q:v 2 "$OUT"
