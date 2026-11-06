#!/usr/bin/env bash
# One image per prompt, through the codex CLI's built-in image generation tool.
#   tools/art/chronicle-2026-11/gen.sh <id> [<id>...]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
for id in "$@"; do
  prompt=$(cat "$HERE/prompts/$id.txt")
  codex exec --skip-git-repo-check -s workspace-write -C "$HERE/moments" \
    "Use your built-in image generation tool (not code, not SVG) to generate exactly one image at 1536x1024 from the prompt below, unchanged. Then copy the resulting PNG to ./$id.png in the current directory and print the path. Do nothing else.

PROMPT: $prompt" > "$HERE/moments/$id.log" 2>&1 &
done
wait
