#!/usr/bin/env python3
"""Speaks the lines of a 视频号 「AI 早报」 video with VoxCPM2 on Apple silicon (mlx-audio).

Run by scripts/wechat-video.ts with the Python of a venv that has mlx-audio and soundfile; it loads the
model once and speaks every line. Reads one JSON request on stdin:

  {"model": "mlx-community/VoxCPM2-bf16", "timesteps": 10,
   "instruct": "沉稳的普通话男声……" | null,      # voice design: the voice described in words
   "refAudio": "/abs/voice.wav" | null,           # or cloned from a recording (with permission)
   "refText": "录音的逐字文本" | null,             # its transcript, for closer cloning
   "lines": [{"text": "...", "out": "/abs/001.wav"}]}

and prints one JSON line per spoken line, {"out": ..., "seconds": ...}, then {"done": true}. Logs go to
stderr so stdout stays the protocol.
"""
from __future__ import annotations

import json
import sys


def main() -> None:
    protocol = sys.stdout
    sys.stdout = sys.stderr
    request = json.load(sys.stdin)

    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model

    model = load_model(request["model"])
    voice: dict = {"inference_timesteps": int(request.get("timesteps") or 10)}
    if request.get("refAudio"):
        voice["ref_audio"] = request["refAudio"]
        if request.get("refText"):
            # Continuation of the recording: the closest timbre and delivery VoxCPM2 offers.
            voice["prompt_audio"] = request["refAudio"]
            voice["prompt_text"] = request["refText"]
    elif request.get("instruct"):
        voice["instruct"] = request["instruct"]

    for line in request["lines"]:
        chunks = [np.array(r.audio) for r in model.generate(text=line["text"], **voice)]
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError(f"no audio for: {line['text'][:40]}")
        sf.write(line["out"], audio, model.sample_rate)
        print(json.dumps({"out": line["out"], "seconds": audio.size / model.sample_rate}), file=protocol, flush=True)
    print(json.dumps({"done": True}), file=protocol, flush=True)


if __name__ == "__main__":
    main()
