#!/usr/bin/env bash
# Compresses the ChatGPT illustrations (docs/art-prompts.md) into the WebP files the site uses.
#
#   tools/make-art.sh [SRC_DIR]     (default: ~/Desktop/eacc-art)
#
# Each source is listed by its file name as saved from ChatGPT; outputs go to apps/web/public/media/art/
# at two widths (1600 and 800) except the ambient backdrop, which only needs one; the newsletter's
# header is also a JPEG, as some mail clients cannot show WebP. Needs cwebp and ffmpeg.
set -euo pipefail

SRC=${1:-"$HOME/Desktop/eacc-art"}
OUT=$(cd "$(dirname "$0")/../apps/web/public/media" && pwd)/art
mkdir -p "$OUT"

# output name | source file
ART=(
  "ambient-engine-room|Victorian Steampunk Engine Hall.png"
  "masthead-press|ChatGPT Image Oct 2, 2026, 02_45_40 PM.png"
  "cat-models|Mechanical Brain in the Steampunk Foundry.png"
  "cat-products|Steampunk Automaton Assembly Line.png"
  "cat-industry|Steampunk City of Smoke and Steam.png"
  "cat-papers|Inventor’s Steampunk Workshop Observatory.png"
  "cat-opinion|Steampunk Automaton Debate in the Grand Hall.png"
  "first-party|Steampunk Mechanical Seal Press Chamber.png"
  "hot|Steampunk Boiler Room Engraving.png"
  "cat-tips|Sepia Steampunk Engineer’s Workshop.png"
  "topics|Steampunk Card Catalog Library.png"
  "empty|Sleepy Automaton in the Steampunk Workshop.png"
)

for a in "${ART[@]}"; do
  IFS='|' read -r name file <<<"$a"
  [ -f "$SRC/$file" ] || continue
  if [ "$name" = "ambient-engine-room" ]; then
    cwebp -quiet -q 42 -resize 1920 0 "$SRC/$file" -o "$OUT/$name.webp"
  else
    cwebp -quiet -q 68 -resize 1600 0 "$SRC/$file" -o "$OUT/$name-1600.webp"
    cwebp -quiet -q 68 -resize 800 0 "$SRC/$file" -o "$OUT/$name-800.webp"
  fi
done
# The newsletter's header (newsletter/mail.ts): one JPEG, sized for a 600px-wide letter on retina screens.
if [ -f "$SRC/Victorian Pneumatic Mailroom Engraving.png" ]; then
  ffmpeg -loglevel error -y -i "$SRC/Victorian Pneumatic Mailroom Engraving.png" -vf "scale=900:-1" -q:v 7 "$OUT/subscribe-email.jpg"
fi
# Chronicle plates use their era or milestone id, not a fixed list.
shopt -s nullglob
for group in epochs moments; do
  for file in "$SRC/$group/"*.png; do
    name=$(basename "$file" .png)
    mkdir -p "$OUT/$group"
    cwebp -quiet -q 68 -resize 1600 0 "$file" -o "$OUT/$group/$name-1600.webp"
    cwebp -quiet -q 68 -resize 800 0 "$file" -o "$OUT/$group/$name-800.webp"
  done
done
du -sh "$OUT"
