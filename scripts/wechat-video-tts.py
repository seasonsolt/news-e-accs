#!/usr/bin/env python3
"""Speaks the lines of a 视频号 「AI 早报」 video with VoxCPM2 on Apple silicon (mlx-audio).

Run by scripts/wechat-video.ts with the Python of a venv that has mlx-audio and soundfile. The model is
loaded once. Each line after the first is a continuation of the previous line's audio and text, so the
voice does not start over at every card. A reference recording (ref_audio) or a voice description
(instruct) still sets the timbre. Reads one JSON request on stdin:

  {"model": "mlx-community/VoxCPM2-bf16", "timesteps": 18,
   "instruct": "沉稳的普通话男声……" | null,
   "refAudio": "/abs/voice.wav" | null,
   "refText": "录音的逐字文本" | null,
   "whisperModel": "small" | null,
   "lines": [{"text": "...", "out": "/abs/001.wav"}]}

and prints one JSON line per spoken line:

  {"out": "...", "seconds": 1.2, "transcript": "..." | null, "words": [{"word","start","end"}] | null}

then {"done": true}. A {"notice": "..."} line reports a missing faster-whisper. Logs go to stderr.
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
    timesteps = int(request.get("timesteps") or 18)
    whisper = load_whisper(request.get("whisperModel"), protocol)
    previous: tuple[str, str] | None = None

    for line in request["lines"]:
        chunks = [np.array(r.audio) for r in model.generate(text=line["text"], **voice_for(request, timesteps, previous))]
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError(f"no audio for: {line['text'][:40]}")
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        peak = float(np.max(np.abs(audio)))
        # The same peak on every clip, before the program-wide two-pass loudnorm.
        if peak > 1e-4:
            audio *= np.float32(10 ** (-1.0 / 20.0) / peak)
        sf.write(line["out"], audio, model.sample_rate)
        heard = transcribe(whisper, line["out"])
        payload: dict = {"out": line["out"], "seconds": float(audio.size / model.sample_rate)}
        if heard is None:
            payload["transcript"] = None
            payload["words"] = None
        else:
            payload["transcript"] = heard[0]
            payload["words"] = heard[1]
        print(json.dumps(payload, ensure_ascii=False), file=protocol, flush=True)
        previous = (line["out"], line["text"])
    print(json.dumps({"done": True}), file=protocol, flush=True)


def voice_for(request: dict, timesteps: int, previous: tuple[str, str] | None) -> dict:
    """Timbre from the description or the reference; prosody continues from the previous line."""
    kwargs: dict = {"inference_timesteps": timesteps}
    ref = request.get("refAudio")
    instruct = request.get("instruct")
    if ref:
        kwargs["ref_audio"] = ref
    elif instruct:
        kwargs["instruct"] = instruct
    if previous:
        kwargs["prompt_audio"] = previous[0]
        kwargs["prompt_text"] = previous[1]
        if instruct and not ref:
            kwargs["instruct"] = instruct
    elif ref and request.get("refText"):
        kwargs["prompt_audio"] = ref
        kwargs["prompt_text"] = request["refText"]
    return kwargs


def load_whisper(name: str | None, protocol):
    if not name:
        print(json.dumps({"notice": "未启用 faster-whisper，字幕按字数比例对齐。"}), file=protocol, flush=True)
        return None
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"notice": "未安装 faster-whisper，字幕按字数比例对齐。安装：在配音的 venv 里 pip install faster-whisper。"}), file=protocol, flush=True)
        return None
    try:
        # cpu int8 runs on the editor's Mac; the model is whatever is already cached.
        return WhisperModel(name, device="cpu", compute_type="int8")
    except Exception as exc:
        print(json.dumps({"notice": f"faster-whisper 没能加载（{exc}），字幕按字数比例对齐。"}), file=protocol, flush=True)
        return None


def transcribe(model, path: str):
    if model is None:
        return None
    try:
        return collect(model, path, vad=True)
    except Exception:
        try:
            return collect(model, path, vad=False)
        except Exception as exc:
            print(f"faster-whisper 这一段没转写（{exc}），改按字数对齐", file=sys.stderr)
            return None


def load_audio(path: str):
    """16 kHz mono float32. faster-whisper would otherwise open the file with PyAV, and PyAV 19
    dropped the metadata_errors argument that release still passes, so every line would fail."""
    audio, rate = sf.read(path, dtype="float32", always_2d=False)
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if int(rate) != 16000 and audio.size:
        n = int(round(audio.size * 16000 / int(rate)))
        audio = np.interp(np.linspace(0, audio.size - 1, n), np.arange(audio.size), audio).astype(np.float32)
    return np.ascontiguousarray(audio)


def collect(model, path: str, vad: bool):
    segments, _info = model.transcribe(load_audio(path), language="zh", word_timestamps=True, vad_filter=vad)
    words = []
    texts = []
    for seg in segments:
        texts.append(seg.text or "")
        for word in seg.words or []:
            words.append({"word": word.word, "start": float(word.start), "end": float(word.end)})
    return "".join(texts).strip(), words


if __name__ == "__main__":
    main()
