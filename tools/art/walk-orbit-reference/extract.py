#!/usr/bin/env python3
"""Extract the orbit artwork, preserving unobstructed RGB pixels without AI edits.

Requires Pillow. Run with the original 1671x941 PNG as the positional argument.
The delivery version of this artwork is archived at f3a8f695 as
apps/web/public/media/art/walk-odyssey-hd-1600.webp. That version is also accepted
as an input, preserving its native resolution and decoded RGB values.

The portrait is a crop of the same image and contains no additional planet data.
The original monolith hides part of the planet. Only that occluded area, plus a
six-pixel safety margin, receives a smooth illumination continuation from
adjacent visible pixels. A row gradient seeds a masked diffusion pass to match
the surrounding illumination in both dimensions. It reconstructs no cloud detail and
must not be described as recovered original surface. The planet remains a
continuous alpha shape. The lower atmosphere and clipped ring ends fade out.
All unobstructed cloud bands and bright edges retain their original RGB data.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

REFERENCE_SIZE = (1671, 941)
CROP = (334, 0, 1671, 512)
CENTER = (1161.801, 322.330)
RADIUS = 303.381
MONOLITH = [(1167, 270), (1333, 223), (1363, 236), (1363, 669), (1163, 667)]


def smooth(low, high, value):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3.0 - 2.0 * t)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[3] / "apps/web/public/media/walk/orbit-cover.webp")
    args = parser.parse_args()
    with Image.open(args.source) as original:
        image = original.convert("RGB")
    sx, sy = image.width / REFERENCE_SIZE[0], image.height / REFERENCE_SIZE[1]
    if abs(sx / sy - 1) > .01:
        raise ValueError("Use the full landscape image, not the cropped portrait")
    box = tuple(round(v * (sx if i % 2 == 0 else sy)) for i, v in enumerate(CROP))
    rgb = image.crop(box)
    width, height = rgb.size
    hidden = Image.new("L", rgb.size)
    ImageDraw.Draw(hidden).polygon([(round(x * sx) - box[0], round(y * sy) - box[1]) for x, y in MONOLITH], fill=255)
    hidden = hidden.filter(ImageFilter.MaxFilter(13))
    hidden_pixels, rgb_pixels = hidden.load(), rgb.load()
    repaired = rgb.copy()
    repaired_pixels = repaired.load()

    def neighboring_color(left, right, y):
        samples = [rgb_pixels[x, row] for row in range(max(0, y - 2), min(height, y + 3))
                   for x in range(max(0, left), min(width, right + 1)) if not hidden_pixels[x, row]]
        return tuple(sum(color[k] for color in samples) / len(samples) for k in range(3))

    for y in range(height):
        bounds = hidden.crop((0, y, width, y + 1)).getbbox()
        if bounds is None:
            continue
        left, right = bounds[0], bounds[2] - 1
        start, end = neighboring_color(left - 9, left - 2, y), neighboring_color(right + 2, right + 9, y)
        for x in range(left, right + 1):
            t = smooth(0, 1, (x - left + 1) / (right - left + 2))
            repaired_pixels[x, y] = tuple(round(a * (1 - t) + b * t) for a, b in zip(start, end))

    repair_box = hidden.getbbox()
    if repair_box:
        left, top, right, bottom = repair_box
        repair_box = (max(0, left - 2), max(0, top - 2), min(width, right + 2), min(height, bottom + 2))
        fixed = rgb.crop(repair_box)
        repair_mask = hidden.crop(repair_box)
        region = repaired.crop(repair_box)
        for _ in range(600):
            region = Image.composite(region.filter(ImageFilter.BoxBlur(1)), fixed, repair_mask)
        repaired.paste(region, repair_box)
        repaired_pixels = repaired.load()

    ring_background = []
    for px in range(width):
        x = (px + box[0]) / sx
        upper, lower = 787.5 - .470 * x, 741 - .409 * x
        center, half = (upper + lower) / 2, max(1.5, (lower - upper) / 2)
        rows = [max(0, min(image.height - 1, round((center + side * (half + 12)) * sy))) for side in [-1, 1]]
        outside = [row for row in rows if math.hypot(x - CENTER[0], row / sy - CENTER[1]) > RADIUS + 6]
        pixels = [image.getpixel((px + box[0], row)) for row in outside or rows]
        ring_background.append(tuple(sum(pixel[k] for pixel in pixels) / len(pixels) for k in range(3)))

    alpha = Image.new("L", rgb.size)
    alpha_pixels = alpha.load()
    for py in range(height):
        y = (py + box[1]) / sy
        for px in range(width):
            x = (px + box[0]) / sx
            radial = math.hypot(x - CENTER[0], y - CENTER[1])
            feather = 28 - 26 * smooth(-.4, .6, (x - CENTER[0]) / RADIUS)
            disc = (1 - smooth(RADIUS - feather, RADIUS + 3, radial)) * (1 - smooth(360, 505, y))
            upper, lower = 787.5 - .470 * x, 741 - .409 * x
            center, half = (upper + lower) / 2, max(1.5, (lower - upper) / 2)
            contrast = max(value - background for value, background in zip(rgb_pixels[px, py], ring_background[px]))
            ring = 1 - smooth(half + 2, half + 6, abs(y - center))
            ring *= smooth(.5, 15, contrast) * smooth(560, 820, x) * (1 - smooth(1380, 1671, x))
            alpha_pixels[px, py] = round(max(disc, ring) * 255)
    rgba = Image.new("RGBA", rgb.size)
    rgba_pixels = rgba.load()
    for py in range(height):
        for px in range(width):
            if alpha_pixels[px, py]:
                rgba_pixels[px, py] = (*repaired_pixels[px, py], alpha_pixels[px, py])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(args.output, lossless=True, quality=100, method=6, exact=False)
    with Image.open(args.output) as saved:
        decoded = saved.convert("RGBA")
        for source, result, mask, actual in zip(rgb.get_flattened_data(), repaired.get_flattened_data(), hidden.get_flattened_data(), decoded.get_flattened_data()):
            if not mask and source != result:
                raise AssertionError("An RGB pixel outside the repair mask changed")
            if actual[3] and result != actual[:3]:
                raise AssertionError("A visible RGB pixel changed during encoding")
    center = ((CENTER[0] * sx - box[0]) / width, (CENTER[1] * sy - box[1]) / height)
    print(json.dumps({
        "asset": str(args.output), "size": [width, height], "sourceSize": image.size,
        "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "crop": list(box), "planetCenterUVTopLeft": center,
        "planetCenterUVBottomLeft": [center[0], 1 - center[1]],
        "planetRadiusPixels": RADIUS * sx,
        "ringUpperInOriginal": [787.5, -.470], "ringLowerInOriginal": [741, -.409],
        "sourceReferenceSize": REFERENCE_SIZE, "originalMonolithPolygon": MONOLITH,
        "alphaTreatment": "Continuous planet alpha; lower atmosphere fades at y360–505, left ring glow at x560–820, right ring at x1380–1671.",
        "occludedRgbTreatment": "Adjacent visible same-image pixels seed a masked illumination diffusion pass. No unseen cloud detail recovered or synthesized.",
        "rgbPreservedOutsideRepairMask": True, "visibleDecodedPixelsLossless": True,
        "transparentRgbDiscarded": True, "bytes": args.output.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
