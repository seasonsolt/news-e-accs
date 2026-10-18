#!/usr/bin/env python3
"""Speaks the lines of a 视频号 「AI 早报」 video with VoxCPM2: on Apple silicon with mlx-audio (an
mlx-community model), on an NVIDIA GPU with the voxcpm package (openbmb/VoxCPM2).

Run by scripts/wechat-video.ts with the Python of a venv that has one of them and soundfile; it loads the
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

    import soundfile as sf

    speak, sample_rate = (mlx if request["model"].startswith("mlx-community/") else cuda)(request)
    for line in request["lines"]:
        audio = speak(line["text"])
        if audio.size == 0:
            raise RuntimeError(f"no audio for: {line['text'][:40]}")
        sf.write(line["out"], audio, sample_rate)
        print(json.dumps({"out": line["out"], "seconds": audio.size / sample_rate}), file=protocol, flush=True)
    print(json.dumps({"done": True}), file=protocol, flush=True)


def mlx(request: dict):
    import numpy as np
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

    def speak(text: str):
        chunks = [np.array(r.audio) for r in model.generate(text=text, **voice)]
        return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)

    return speak, model.sample_rate


def cuda(request: dict):
    import os

    from voxcpm import VoxCPM

    model = VoxCPM.from_pretrained(request["model"], load_denoiser=False, local_files_only=os.environ.get("HF_HUB_OFFLINE") == "1")
    voice: dict = {"inference_timesteps": int(request.get("timesteps") or 10)}
    instruct = ""
    if request.get("refAudio"):
        voice["reference_wav_path"] = request["refAudio"]
        if request.get("refText"):
            voice["prompt_wav_path"] = request["refAudio"]
            voice["prompt_text"] = request["refText"]
    elif request.get("instruct"):
        # The voxcpm package takes the voice's description in brackets before the text.
        instruct = f"({request['instruct']})"
    return (lambda text: model.generate(text=instruct + text, **voice)), model.tts_model.sample_rate


if __name__ == "__main__":
    main()
