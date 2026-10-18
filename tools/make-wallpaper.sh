#!/usr/bin/env bash
# Turns a ChatGPT illustration (1536×1024) into 4K wallpapers (docs/art-prompts.md, "壁纸").
#
#   tools/make-wallpaper.sh SRC.png [OUT_DIR]     (default: ~/Desktop/eacc-wallpaper)
#
# Real-ESRGAN x4plus upscales 4×, then each cut is scaled to cover its frame, centre-cropped and given a
# light grain: x4plus smooths fine texture (foliage, hair, fabric) into a painted look, and the grain
# brings back the impression of detail. x4plus is BSD-3, so the output can be sold; 4x-UltraSharp and
# Remacri look sharper but are CC BY-NC-SA, and Upscayl's other models have no stated licence.
# Outputs <name>-desktop.jpg (3840×2160) and <name>-phone.jpg (2160×3840) into OUT_DIR.
# GRAIN sets the grain strength (default 4, 0 turns it off); FOCUS_X (0..1, default 0.5) picks which
# slice of the landscape the phone cut keeps. Needs ffmpeg and realesrgan-ncnn-vulkan
# (REALESRGAN=path, or on PATH) with its models/ directory next to it.
set -euo pipefail

SRC=${1:?usage: tools/make-wallpaper.sh SRC.png [OUT_DIR]}
OUT=${2:-"$HOME/Desktop/eacc-wallpaper"}
BIN=${REALESRGAN:-$(command -v realesrgan-ncnn-vulkan || true)}
GRAIN=${GRAIN:-4}
FOCUS_X=${FOCUS_X:-0.5}
[ -f "$SRC" ] || { echo "no such file: $SRC" >&2; exit 1; }
[ -x "$BIN" ] || { echo "realesrgan-ncnn-vulkan not found: set REALESRGAN or put it on PATH" >&2; exit 1; }
mkdir -p "$OUT"
name=$(basename "${SRC%.*}")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# It exits 0 even when it fails, so check that it wrote the image.
"$BIN" -i "$SRC" -o "$TMP/x4.png" -n realesrgan-x4plus -m "$(dirname "$BIN")/models" >"$TMP/log" 2>&1 || true
[ -s "$TMP/x4.png" ] || { cat "$TMP/log" >&2; exit 1; }

grain=""
[ "$GRAIN" != 0 ] && grain=",noise=alls=$GRAIN:allf=t"
# cut | width | height | horizontal crop position
for c in "desktop|3840|2160|0.5" "phone|2160|3840|$FOCUS_X"; do
  IFS='|' read -r cut w h fx <<<"$c"
  ffmpeg -loglevel error -y -i "$TMP/x4.png" \
    -vf "scale=$w:$h:force_original_aspect_ratio=increase:flags=lanczos,crop=$w:$h:(iw-$w)*$fx:(ih-$h)/2$grain" \
    -q:v 2 "$OUT/$name-$cut.jpg"
done
ls -lh "$OUT/$name"-*.jpg
