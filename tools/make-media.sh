#!/usr/bin/env bash
# Renders the onboarding film ("动图") for e-acc.ai: the acceleration from the Big Bang to a Type I
# civilization, one era plate each from the chronicle's own illustrations, in order.
#
#   tools/make-media.sh [SRC_DIR]     (default: apps/web/public/media/art/epochs)
#
# Every plate pushes in by the same amount (scale is re-evaluated per frame, so motion is sub-pixel
# smooth — zoompan jitters at these speeds) over its own hold. Deep time holds long; from the steam age
# the holds drop steeply, so the push turns into a sprint toward the present: the film accelerates. Plates are chained with crossfades, and the chain ends on a
# copy of the first clip so trimming it from XF yields a seamless loop. The plate list and the holds
# must match apps/web/app/features/onboarding/ascent.ts, whose captions follow the
# playhead; apps/web/tests/onboarding.test.ts checks that. Outputs a 16:9 and a 9:16 cut and their
# posters into apps/web/public/media/. Needs ffmpeg (libx264) and bc.
set -euo pipefail

OUT=$(cd "$(dirname "$0")/../apps/web/public" && pwd)
SRC=${1:-"$OUT/media/art/epochs"}
FPS=24 XF=0.6 Z=1.12

# slug | source file | hold (seconds) | focus x y (where the push heads, 0..1 of free space)
CLIPS=(
  "big-bang|big-bang-1600.webp|5.0|0.50 0.50"
  "origin-of-life|origin-of-life-1600.webp|4.5|0.50 0.45"
  "cambrian-explosion|cambrian-explosion-1600.webp|4.0|0.50 0.40"
  "taming-fire|taming-fire-1600.webp|3.5|0.55 0.55"
  "cognitive-revolution|cognitive-revolution-1600.webp|3.1|0.50 0.45"
  "uruk-accounting-v2|uruk-accounting-v2-1600.webp|2.8|0.85 0.45"
  "printing|printing-1600.webp|2.5|0.50 0.50"
  "steam-age|steam-age-1600.webp|2.0|0.55 0.45"
  "electric-age|electric-age-1600.webp|1.5|0.50 0.45"
  "space-age|space-age-1600.webp|1.2|0.60 0.45"
  "internet-v2|internet-v2-1600.webp|1.0|0.50 0.45"
  "large-models-v2|large-models-v2-1600.webp|1.0|0.50 0.45"
  "agents|agents-1600.webp|1.1|0.60 0.55"
  "kardashev-i-speculative|kardashev-i-speculative-1600.webp|5.0|0.50 0.50"
)

render() { # $1=W $2=H $3=name
  local W=$1 H=$2 name=$3 inputs=() filters="" i=0 n prev off=0 d
  local seq=("${CLIPS[@]}" "${CLIPS[0]}")
  for c in "${seq[@]}"; do
    IFS='|' read -r _ file hold focus <<<"$c"
    read -r fx fy <<<"$focus"
    d=$(echo "$hold+$XF" | bc -l)
    inputs+=(-framerate "$FPS" -loop 1 -t "$d" -i "$SRC/$file")
    local p="(t/$d)"
    # cover-fit: scale the short side of the crop box to its target, times the push
    local cover="max($W/iw\,$H/ih)"
    filters+="[$i:v]scale=w='ceil(iw*$cover*(1+($Z-1)*$p)/2)*2':h=-2:eval=frame:flags=bicubic,"
    filters+="crop=$W:$H:x='(iw-ow)*$fx':y='(ih-oh)*$fy',"
    filters+="setsar=1,fps=$FPS,format=yuv420p[c$i];"
    i=$((i+1))
  done
  n=$i prev="c0"
  # Plate k starts fading in when the holds before it have run (offsets are into the untrimmed chain).
  for ((k=1; k<n; k++)); do
    IFS='|' read -r _ _ hold _ <<<"${seq[$((k-1))]}"
    off=$(echo "$off+$hold" | bc -l)
    filters+="[$prev][c$k]xfade=transition=fade:duration=$XF:offset=$off[x$k];"
    prev="x$k"
  done
  local end; end=$(echo "$off+$XF" | bc -l)
  filters+="[$prev]trim=start=$XF:end=$end,setpts=PTS-STARTPTS,eq=contrast=1.06:saturation=0.88,vignette=PI/5[v]"
  ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$filters" -map "[v]" \
    -c:v libx264 -preset slow -crf 30 -profile:v high -pix_fmt yuv420p -movflags +faststart -an \
    "$OUT/media/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/media/$name.mp4" -frames:v 1 -q:v 3 "$OUT/media/$name-poster.jpg"
  echo "$name.mp4 $(du -h "$OUT/media/$name.mp4" | cut -f1)"
}

render 1280 720 ascent-historical-v2-16x9
render 720 1280 ascent-historical-v2-9x16

