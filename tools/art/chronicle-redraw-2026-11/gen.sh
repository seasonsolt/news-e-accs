#!/usr/bin/env bash
# One image per prompt, through the codex CLI's built-in image generation tool, four at a time.
#   tools/art/chronicle-redraw-2026-11/gen.sh <art> [<art>...]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
one() {
  id=$1
  prompt=$(cat "$HERE/prompts/$id.txt")
  codex exec --skip-git-repo-check -s workspace-write -C "$HERE/plates" \
    "Use your built-in image generation tool (not code, not SVG) to generate exactly one image at 1536x1024 from the prompt below, unchanged. Then copy the resulting PNG to ./$id.png in the current directory and print the path. Do nothing else.

PROMPT: $prompt" > "$HERE/plates/$id.log" 2>&1
}
for id in "$@"; do
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 2; done
  one "$id" &
done
wait
