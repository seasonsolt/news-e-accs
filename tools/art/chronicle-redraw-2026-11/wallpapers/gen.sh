#!/usr/bin/env bash
# Portrait wallpaper or two-phone preview through the codex CLI, four at a time, from an attached source image.
# Outputs go to .data/wallpaper-redraw/, which is not committed.
#   tools/art/chronicle-redraw-2026-11/wallpapers/gen.sh portrait|mockup <art> [<art>...]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$HERE/../../../.." && pwd)/.data/wallpaper-redraw
kind=$1; shift
[ "$kind" = portrait ] && { size=1024x1536; dir=portrait; } || { size=1536x1024; dir=mockups; }
one() {
  id=$1
  [ "$kind" = portrait ] && src="$HERE/../plates/$id.png" || src="$OUT/portrait/$id.png"
  prompt=$(cat "$HERE/prompts/$id.$kind.txt")
  codex exec --skip-git-repo-check -s workspace-write -C "$OUT/$dir" -i "$src" -- \
    "Use your built-in image generation tool (not code, not SVG), using the attached image as the reference, to generate exactly one image at $size from the prompt below, unchanged. Then copy the resulting PNG to ./$id.png in the current directory and print the path. Do nothing else.

PROMPT: $prompt" > "$OUT/$dir/$id.log" 2>&1
}
for id in "$@"; do
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 2; done
  one "$id" &
done
wait
