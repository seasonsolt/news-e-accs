#!/usr/bin/env bash
# Turns a ChatGPT illustration (1536×1024) into 4K wallpapers (docs/art-prompts.md, "壁纸").
#
#   tools/make-wallpaper.sh SRC.png [OUT_DIR]     (default: ~/Desktop/eacc-wallpaper)
#
# Real-ESRGAN x4plus upscales 4×, then each cut is scaled to cover its frame, centre-cropped and given a
# light grain: x4plus smooths fine texture (foliage, hair, fabric) into a painted look, and the grain
# brings back the impression of detail. x4plus is BSD-3, so the output can be sold; 4x-UltraSharp and
# Remacri look sharper but are CC BY-NC-SA, and Upscayl's other models have no stated licence.
# Outputs <name>-desktop.jpg (3840×2160), <name>-phone.jpg (2160×3840), and <name>-preview.webp (width 1600).
# GRAIN sets the grain strength (default 4, 0 turns it off); FOCUS_X (0..1, default 0.5) picks which
# slice of the landscape the phone cut keeps. Needs ffmpeg and realesrgan-ncnn-vulkan
# and cwebp (REALESRGAN=path, or on PATH) with its models/ directory next to it.
# e-acc.ai watermark is added after cropping, before grain: desktop bottom-right,
# 44px type, 64px right/bottom margins; phone bottom-centre, 56px type, 260px bottom margin.
# White at 55% opacity, black 35% shadow offset 2px. WATERMARK=0 is for self-check only.
set -euo pipefail

SRC=${1:?usage: tools/make-wallpaper.sh SRC.png [OUT_DIR]}
OUT=${2:-"$HOME/Desktop/eacc-wallpaper"}
BIN=${REALESRGAN:-$(command -v realesrgan-ncnn-vulkan || true)}
GRAIN=${GRAIN:-4}
WATERMARK=${WATERMARK:-1}
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FONT="$SCRIPT_DIR/../assets/og-fonts/noto-sans-sc-700.ttf"
[ "$WATERMARK" = 0 ] || [ -f "$FONT" ] || { echo "watermark font missing: $FONT" >&2; exit 1; }
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
  watermark=""
  if [ "$WATERMARK" != 0 ]; then
    if [ "$cut" = desktop ]; then
      fontsize=44; mark_x="w-tw-64"; mark_y="h-th-64"
    else
      fontsize=56; mark_x="(w-tw)/2"; mark_y="h-th-260"
    fi
    watermark=",drawtext=fontfile='$FONT':text='e-acc.ai':fontcolor=white@0.55:fontsize=$fontsize:x=$mark_x:y=$mark_y:shadowcolor=black@0.35:shadowx=2:shadowy=2"
  fi
  ffmpeg -nostdin -loglevel error -y -i "$TMP/x4.png" \
    -vf "scale=$w:$h:force_original_aspect_ratio=increase:flags=lanczos,crop=$w:$h:(iw-$w)*$fx:(ih-$h)/2$watermark$grain" \
    -q:v 2 "$OUT/$name-$cut.jpg"
done
cwebp -quiet -q 72 -resize 1600 0 "$OUT/$name-desktop.jpg" -o "$OUT/$name-preview.webp"
ls -lh "$OUT/$name"-*.jpg "$OUT/$name-preview.webp"
