#!/usr/bin/env bash
# Renders the onboarding film ("动图") for e-acc.ai: the acceleration from the Big Bang to a Type I
# civilization, one era plate each from the chronicle's own illustrations, in order.
#
#   tools/make-media.sh [SRC_DIR]     (default: apps/web/public/media/art/epochs)
#
# Each plate gets a slow zoom + pan (scale is re-evaluated per frame, so motion is sub-pixel smooth —
# zoompan jitters at these speeds), plates are chained with crossfades, and the chain ends on a copy of
# the first clip so trimming [XF, end-D+XF) yields a seamless loop. The plate list and the timing
# (STEP = D − XF) must match apps/web/app/features/onboarding/ascent.ts, whose captions follow the
# playhead; apps/web/tests/onboarding.test.ts checks that. Outputs a 16:9 and a 9:16 cut and their
# posters into apps/web/public/media/. Needs ffmpeg (libx264) and bc.
set -euo pipefail

OUT=$(cd "$(dirname "$0")/../apps/web/public" && pwd)
SRC=${1:-"$OUT/media/art/epochs"}
FPS=24 D=3.2 XF=0.8

# slug | source file | zoom0 zoom1 | panX0 panX1 | panY0 panY1   (pan = 0..1 of free space)
CLIPS=(
  "big-bang|big-bang-1600.webp|1.00 1.10|0.50 0.50|0.50 0.45"
  "origin-of-life|origin-of-life-1600.webp|1.10 1.00|0.45 0.55|0.50 0.50"
  "cambrian-explosion|cambrian-explosion-1600.webp|1.00 1.10|0.55 0.45|0.45 0.55"
  "taming-fire|taming-fire-1600.webp|1.10 1.00|0.50 0.50|0.55 0.45"
  "cognitive-revolution|cognitive-revolution-1600.webp|1.00 1.10|0.45 0.55|0.50 0.50"
  "cities-writing|cities-writing-1600.webp|1.10 1.00|0.55 0.45|0.45 0.50"
  "printing|printing-1600.webp|1.00 1.10|0.50 0.50|0.50 0.40"
  "steam-age|steam-age-1600.webp|1.10 1.00|0.45 0.55|0.40 0.50"
  "electric-age|electric-age-1600.webp|1.00 1.10|0.55 0.45|0.50 0.50"
  "space-age|space-age-1600.webp|1.10 1.00|0.50 0.50|0.45 0.55"
  "internet|internet-1600.webp|1.00 1.10|0.45 0.55|0.50 0.50"
  "large-models|large-models-1600.webp|1.10 1.00|0.55 0.45|0.50 0.45"
  "agents|agents-1600.webp|1.00 1.10|0.50 0.50|0.55 0.45"
  "kardashev-i-speculative|kardashev-i-speculative-1600.webp|1.10 1.00|0.50 0.50|0.45 0.50"
)

render() { # $1=W $2=H $3=name
  local W=$1 H=$2 name=$3 inputs=() filters="" i=0 n prev off
  local seq=("${CLIPS[@]}" "${CLIPS[0]}")
  for c in "${seq[@]}"; do
    IFS='|' read -r _ file zoom px py <<<"$c"
    read -r z0 z1 <<<"$zoom"; read -r x0 x1 <<<"$px"; read -r y0 y1 <<<"$py"
    inputs+=(-framerate "$FPS" -loop 1 -t "$D" -i "$SRC/$file")
    local p="(t/$D)"
    # cover-fit: scale the short side of the crop box to its target, times the zoom
    local cover="max($W/iw\,$H/ih)"
    filters+="[$i:v]scale=w='ceil(iw*$cover*($z0+($z1-$z0)*$p)/2)*2':h=-2:eval=frame:flags=bicubic,"
    filters+="crop=$W:$H:x='(iw-ow)*($x0+($x1-$x0)*$p)':y='(ih-oh)*($y0+($y1-$y0)*$p)',"
    filters+="setsar=1,fps=$FPS,format=yuv420p[c$i];"
    i=$((i+1))
  done
  n=$i prev="c0"
  for ((k=1; k<n; k++)); do
    off=$(echo "$k*($D-$XF)" | bc -l)
    filters+="[$prev][c$k]xfade=transition=fade:duration=$XF:offset=$off[x$k];"
    prev="x$k"
  done
  local end; end=$(echo "($n-1)*($D-$XF)+$XF" | bc -l)
  filters+="[$prev]trim=start=$XF:end=$end,setpts=PTS-STARTPTS,eq=contrast=1.06:saturation=0.88,vignette=PI/5[v]"
  ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$filters" -map "[v]" \
    -c:v libx264 -preset slow -crf 30 -profile:v high -pix_fmt yuv420p -movflags +faststart -an \
    "$OUT/media/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/media/$name.mp4" -frames:v 1 -q:v 3 "$OUT/media/$name-poster.jpg"
  echo "$name.mp4 $(du -h "$OUT/media/$name.mp4" | cut -f1)"
}

render 1280 720 hero-16x9
render 720 1280 hero-9x16

