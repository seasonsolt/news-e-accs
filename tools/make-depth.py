# /// script
# requires-python = ">=3.10"
# dependencies = ["torch", "transformers", "pillow", "numpy"]
# ///
"""Estimates a depth map for each chronicle plate, for the observatory's parallax.

    uv run tools/make-depth.py [SRC_DIR] [--force]     (default: apps/web/public/media/art/epochs)

Reads every <slug>-1600.webp in SRC_DIR and writes <slug>-depth.webp next to it: 800 px wide, grayscale,
white = near. Depth Anything V2 Small (Apache-2.0) runs locally; the first run downloads the model.
The map is normalised between its 2nd and 98th percentiles and softened a little, so the shader's
parallax bends edges instead of tearing them. Existing maps are kept unless --force is given.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter
from transformers import pipeline

ROOT = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
force = "--force" in sys.argv
src = Path(args[0]) if args else ROOT / "apps/web/public/media/art/epochs"

device = "mps" if torch.backends.mps.is_available() else "cpu"
estimate = pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device=device)

plates = sorted(src.glob("*-1600.webp"))
for plate in plates:
    out = plate.with_name(plate.name.replace("-1600.webp", "-depth.webp"))
    if out.exists() and not force:
        continue
    image = Image.open(plate).convert("RGB")
    depth = np.asarray(estimate(image)["predicted_depth"].squeeze().float().cpu())
    lo, hi = np.percentile(depth, [2, 98])
    depth = np.clip((depth - lo) / max(hi - lo, 1e-6), 0, 1)
    gray = Image.fromarray((depth * 255).astype(np.uint8), "L")
    width = 800
    gray = gray.resize((width, round(width * image.height / image.width)), Image.BICUBIC)
    gray.filter(ImageFilter.GaussianBlur(2)).save(out, "WEBP", quality=88)
    print(out.relative_to(ROOT))
