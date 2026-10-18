#!/usr/bin/env python3
"""Listens to the spoken lines of a 视频号 「AI 早报」 video: when each word of the script is said
(Qwen3-ForcedAligner, for the subtitles), and what a listener hears (Qwen3-ASR, for the check that the
voice model read every name right). On Apple silicon with mlx-audio (mlx-community models), on an NVIDIA
GPU with the qwen-asr package (the Qwen models).

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

    align, hear = (mlx if request["asr"].startswith("mlx-community/") else cuda)(request)
    for line in request["lines"]:
        aligned = align(line["wav"], line["text"])
        heard = hear(line["wav"])
        words = [[w.text, round(w.start_time, 3), round(w.end_time, 3)] for w in aligned]
        print(json.dumps({"words": words, "heard": heard}, ensure_ascii=False), file=protocol, flush=True)
    print(json.dumps({"done": True}), file=protocol, flush=True)


def mlx(request: dict):
    from mlx_audio.stt.utils import load_model

    aligner = load_model(request["aligner"])
    asr = load_model(request["asr"])
    return (lambda wav, text: aligner.generate(wav, text=text, language="Chinese")), (lambda wav: asr.generate(wav, language="Chinese").text)


def cuda(request: dict):
    import os

    import torch
    from huggingface_hub import snapshot_download
    from qwen_asr import Qwen3ASRModel, Qwen3ForcedAligner

    # Offline, transformers still asks the hub about a model named by its id: load it from its folder.
    local = (lambda repo: snapshot_download(repo, local_files_only=True)) if os.environ.get("HF_HUB_OFFLINE") == "1" else (lambda repo: repo)
    aligner = Qwen3ForcedAligner.from_pretrained(local(request["aligner"]), dtype=torch.bfloat16, device_map="cuda:0")
    asr = Qwen3ASRModel.from_pretrained(local(request["asr"]), dtype=torch.bfloat16, device_map="cuda:0")
    return ((lambda wav, text: aligner.align(audio=wav, text=text, language="Chinese")[0]),
            (lambda wav: asr.transcribe(audio=wav, language="Chinese")[0].text))


if __name__ == "__main__":
    main()
