#!/usr/bin/env python3
"""Listens to the spoken lines of a 视频号 「AI 早报」 video on Apple silicon (mlx-audio): when each word of
the script is said (Qwen3-ForcedAligner, for the subtitles), and what a listener hears (Qwen3-ASR, for the
check that the voice model read every name right).

Run by scripts/wechat-video.ts with the Python of the voice venv. Reads one JSON request on stdin:

  {"aligner": "mlx-community/Qwen3-ForcedAligner-0.6B-8bit", "asr": "mlx-community/Qwen3-ASR-1.7B-8bit",
   "lines": [{"text": "...", "wav": "/abs/001.wav"}]}

and prints one JSON line per spoken line, {"words": [[text, start, end], ...], "heard": "..."}, then
{"done": true}. Logs go to stderr so stdout stays the protocol.
"""
from __future__ import annotations

import json
import sys


def main() -> None:
    protocol = sys.stdout
    sys.stdout = sys.stderr
    request = json.load(sys.stdin)

    from mlx_audio.stt.utils import load_model

    aligner = load_model(request["aligner"])
    asr = load_model(request["asr"])
    for line in request["lines"]:
        aligned = aligner.generate(line["wav"], text=line["text"], language="Chinese")
        heard = asr.generate(line["wav"], language="Chinese").text
        words = [[w.text, round(w.start_time, 3), round(w.end_time, 3)] for w in aligned]
        print(json.dumps({"words": words, "heard": heard}, ensure_ascii=False), file=protocol, flush=True)
    print(json.dumps({"done": True}), file=protocol, flush=True)


if __name__ == "__main__":
    main()
