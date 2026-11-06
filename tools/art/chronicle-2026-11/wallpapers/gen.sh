#!/usr/bin/env bash
# Portrait wallpaper or two-phone preview, through the codex CLI, from an attached source image.
#   tools/art/chronicle-2026-11/wallpapers/gen.sh portrait|mockup <id> [<id>...]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
kind=$1; shift
[ "$kind" = portrait ] && { size=1024x1536; dir=portrait; } || { size=1536x1024; dir=mockups; }
for id in "$@"; do
  [ "$kind" = portrait ] && src="$HERE/../moments/$id.png" || src="$HERE/portrait/$id.png"
  prompt=$(cat "$HERE/prompts/$id.$kind.txt")
  codex exec --skip-git-repo-check -s workspace-write -C "$HERE/$dir" -i "$src" -- \
    "Use your built-in image generation tool (not code, not SVG), using the attached image as the reference, to generate exactly one image at $size from the prompt below, unchanged. Then copy the resulting PNG to ./$id.png in the current directory and print the path. Do nothing else.

PROMPT: $prompt" > "$HERE/$dir/$id.log" 2>&1 &
done
wait
