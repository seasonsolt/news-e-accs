#!/usr/bin/env python3
"""Writes the music bed of a 视频号 「AI 早报」 video: a quiet, original loop synthesised here, so it has no
licence to clear. Pads on a four-chord progression, a plucked arpeggio, a soft bass and a light pulse at
100 BPM, one bar of pads alone at the start and a fade at the end; the progression is picked by `seed`, so
a day's video keeps its bed when cut again. scripts/wechat-video.ts runs it with the Python of the voice
venv (numpy, scipy and soundfile come with mlx-audio) and ducks it under the voice with ffmpeg.

  python wechat-video-music.py '{"seconds": 62.5, "seed": 20261015, "out": "/abs/music.wav"}'
"""
from __future__ import annotations

import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BEAT = 0.6  # 100 BPM
BAR = 4 * BEAT
# Chords as MIDI notes (C4 = 60): the pad's voicing; the bass plays the first note two octaves down.
PROGRESSIONS = [
    [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]],  # Am7  Fmaj7 C  G
    [[53, 57, 60, 64], [55, 59, 62, 67], [52, 55, 59, 62], [57, 60, 64, 67]],  # Fmaj7 G  Em7 Am7
    [[50, 57, 60, 65], [55, 59, 62, 65], [48, 55, 59, 64], [57, 60, 64, 67]],  # Dm7  G7 Cmaj7 Am7
]


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def tone(midi: float, seconds: float, harmonics: list[float], detune_cents: float = 0.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    f = hz(midi) * 2 ** (detune_cents / 1200)
    return sum(a * np.sin(2 * np.pi * f * (k + 1) * t) for k, a in enumerate(harmonics) if f * (k + 1) < SR / 2)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(n)
    a, r = min(n, int(attack * SR)), min(n, int(release * SR))
    env[:a] = np.linspace(0, 1, a)
    if r:
        env[n - r:] *= np.linspace(1, 0, r) ** 2
    return env


def place(buf: np.ndarray, sound: np.ndarray, at: float, gain: float, pan: float) -> None:
    i = int(at * SR)
    if i >= len(buf):
        return
    s = sound[: len(buf) - i] * gain
    buf[i:i + len(s), 0] += s * np.sqrt((1 - pan) / 2)
    buf[i:i + len(s), 1] += s * np.sqrt((1 + pan) / 2)


def pad(chord: list[int], seconds: float) -> np.ndarray:
    saw = [1 / k for k in range(1, 7)]
    voice = sum(tone(m, seconds, saw, d) for m in chord for d in (-7, 7))
    voice = sosfilt(butter(2, 1800, "low", fs=SR, output="sos"), voice)
    return voice * envelope(len(voice), 0.6, 0.9) / (2 * len(chord))


def pluck(midi: int) -> np.ndarray:
    t = np.arange(int(0.9 * SR)) / SR
    x = tone(midi, 0.9, [1, 0.35, 0.12, 0.05]) * np.exp(-t / 0.22)
    x[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return x


def bass(midi: int) -> np.ndarray:
    t = np.arange(int(1.0 * SR)) / SR
    # The second and third harmonics carry the line on a phone's speaker.
    return tone(midi, 1.0, [1, 0.45, 0.2]) * np.exp(-t / 0.45) * envelope(len(t), 0.01, 0.2)


def kick() -> np.ndarray:
    t = np.arange(int(0.3 * SR)) / SR
    sweep = 2 * np.pi * np.cumsum(50 + 70 * np.exp(-t / 0.03)) / SR
    return np.sin(sweep) * np.exp(-t / 0.12)


def hat(rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(0.08 * SR)) / SR
    noise = sosfilt(butter(2, 7000, "high", fs=SR, output="sos"), rng.standard_normal(len(t)))
    return noise * np.exp(-t / 0.02)


def music(seconds: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    chords = PROGRESSIONS[seed % len(PROGRESSIONS)]
    n = int(seconds * SR)
    dry = np.zeros((n + SR * 2, 2))
    bars = int(np.ceil(seconds / BAR))
    for b in range(bars):
        at, chord = b * BAR, chords[b % len(chords)]
        place(dry, pad(chord, BAR + 0.9), at, 0.55, 0.0)
        if b == 0:
            continue  # the first bar is pads alone, under the opening title
        place(dry, bass(chord[0] - 24), at, 0.55, 0.0)
        place(dry, bass(chord[0] - 24), at + 2.5 * BEAT, 0.4, 0.0)
        arpeggio = [chord[k % len(chord)] + 12 * (1 + k // len(chord)) for k in (0, 1, 2, 3, 4, 3, 2, 1)]
        for k, note in enumerate(arpeggio):
            place(dry, pluck(note), at + k * BEAT / 2, 0.16 * (1 if k % 2 == 0 else 0.75), 0.35 if k % 2 else -0.35)
        for beat in range(4):
            if beat % 2 == 0:
                place(dry, kick(), at + beat * BEAT, 0.25, 0.0)
            place(dry, hat(rng), at + beat * BEAT + BEAT / 2, 0.08, 0.2)
    # A short room: decorrelated decaying noise for each side, mixed in lightly.
    ir_t = np.arange(int(1.4 * SR)) / SR
    wet = np.stack([fftconvolve(dry[:, c], rng.standard_normal(len(ir_t)) * np.exp(-ir_t / 0.35))[: len(dry)] for c in (0, 1)], axis=1)
    out = dry + 0.012 * wet
    out = sosfilt(butter(2, 40, "high", fs=SR, output="sos"), out, axis=0)[:n]
    fade = min(n, int(2.5 * SR))
    out[n - fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return (out / max(1e-9, np.abs(out).max()) * 0.89).astype(np.float32)  # peak at -1 dBFS


def main() -> None:
    request = json.loads(sys.argv[1])
    sf.write(request["out"], music(float(request["seconds"]), int(request["seed"])), SR)


if __name__ == "__main__":
    main()
