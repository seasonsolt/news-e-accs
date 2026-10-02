#!/usr/bin/env bash
# Renders the steampunk hero loop ("动图") for e-acc.ai from still illustrations.
#
#   tools/make-media.sh [SRC_DIR]     (default: ~/Desktop/danqing-bg-images)
#
# Each still gets a slow zoom + pan (scale is re-evaluated per frame, so motion is
# sub-pixel smooth — zoompan jitters at these speeds), stills are chained with 1.2s
# crossfades, and the chain ends on a copy of the first clip so trimming [XF, end-D+XF)
# yields a seamless loop. Outputs a 16:9 and a 9:16 cut and their posters into
# apps/web/public/media/. Needs ffmpeg (libx264) and bc.
set -euo pipefail

SRC=${1:-"$HOME/Desktop/danqing-bg-images"}
OUT=$(cd "$(dirname "$0")/../apps/web/public" && pwd)
FPS=24 D=6 XF=1.2

# slug | source file | zoom0 zoom1 | panX0 panX1 | panY0 panY1   (pan = 0..1 of free space)
CLIPS=(
  "factory|2026-07-21-software-dark-factory__P1-cover-bg-imagegen.png|1.00 1.12|0.50 0.45|0.55 0.40"
  "press|2026-07-19-context-engineering__douyin__02-100k-compact__P1-cover-bg-imagegen.png|1.12 1.00|0.40 0.55|0.35 0.60"
  "engine|2026-07-12-deep-agent-principle__deep-agent-art.png|1.00 1.10|0.50 0.50|0.20 0.55"
  "rockets|2026-07-20-pi-vs-codex-claude__P1-cover-bg-imagegen.png|1.10 1.00|0.55 0.45|0.30 0.45"
  "valves|2026-07-26-claude-opus-5-launch__P1-cover-bg-imagegen.png|1.00 1.12|0.45 0.60|0.70 0.45"
  "automaton|2026-07-14-claudex-declares-war__P1-cover-bg-imagegen.png|1.12 1.00|0.35 0.60|0.45 0.50"
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

