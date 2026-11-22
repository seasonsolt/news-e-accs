#!/usr/bin/env python3
"""Extract the orbit artwork, preserving unobstructed RGB pixels without AI edits.

Requires Pillow. Run with the original 1671x941 PNG as the positional argument.
The delivery version of this artwork is archived at f3a8f695 as
apps/web/public/media/art/walk-odyssey-hd-1600.webp. That version is also accepted
as an input, preserving its native resolution and decoded RGB values.

The portrait is a crop of the same image and contains no additional planet data.
The original monolith hides part of the planet. Only that occluded area, plus a
six-pixel safety margin, receives a smooth illumination continuation. A floating
point, multiscale harmonic solve fixes neighboring original pixels as its
boundary. It reconstructs no cloud detail and must not be described as recovered
original surface. The planet remains a continuous alpha shape. The lower
atmosphere and clipped ring ends fade out. Original cloud bands and bright edges
outside the repair mask retain their RGB data.
"""

from array import array
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

REFERENCE_SIZE = (1671, 941)
SOURCE_SIZES = {(1671, 941), (1600, 901), (3840, 2162), (6400, 3604)}
CROP = (334, 0, 1671, 512)
CENTER = (1161.801, 322.330)
RADIUS = 303.381
MONOLITH = [(1167, 270), (1333, 223), (1363, 236), (1363, 669), (1163, 667)]


def smooth(low, high, value):
    t = max(0.0, min(1.0, (value - low) / (high - low)))
    return t * t * (3.0 - 2.0 * t)


def extend_illumination(image, hidden, scale):
    left, top, right, bottom = hidden.getbbox()
    padding = round(16 * scale)
    box = (max(0, left - padding), max(0, top - padding),
           min(image.width, right + padding), min(image.height, bottom + padding))
    fixed = image.crop(box)
    repair_mask = hidden.crop(box)
    previous = None
    trace = []
    for step in [8, 4, 2, 1]:
        columns = math.ceil(fixed.width / step)
        rows = math.ceil(fixed.height / step)
        size = (columns, rows)
        pixels = list(fixed.resize(size, Image.Resampling.NEAREST).get_flattened_data())
        flags = list(repair_mask.resize(size, Image.Resampling.NEAREST).get_flattened_data())
        channels = []
        for color in range(3):
            if previous:
                floating = Image.frombytes("F", previous[0], array("f", previous[1][color]).tobytes())
                values = list(floating.resize(size, Image.Resampling.BILINEAR).get_flattened_data())
            else:
                known = [pixel[color] for pixel, flag in zip(pixels, flags) if not flag]
                mean = sum(known) / len(known)
                values = [mean if flag else float(pixel[color]) for pixel, flag in zip(pixels, flags)]
            for index, flag in enumerate(flags):
                if not flag:
                    values[index] = float(pixels[index][color])
            channels.append(values)
        active = []
        for index, flag in enumerate(flags):
            if not flag:
                continue
            y, x = divmod(index, columns)
            active.append((index, y * columns + max(0, x - 1), y * columns + min(columns - 1, x + 1),
                           max(0, y - 1) * columns + x, min(rows - 1, y + 1) * columns + x))
        red, green, blue = channels
        for iteration in range(1200):
            error = 0.0
            for index, left, right, up, down in active:
                change = (.25 * (red[left] + red[right] + red[up] + red[down]) - red[index]) * 1.8
                red[index] += change
                error = max(error, abs(change))
                change = (.25 * (green[left] + green[right] + green[up] + green[down]) - green[index]) * 1.8
                green[index] += change
                error = max(error, abs(change))
                change = (.25 * (blue[left] + blue[right] + blue[up] + blue[down]) - blue[index]) * 1.8
                blue[index] += change
                error = max(error, abs(change))
            if error < .002:
                break
        if error >= .002:
            raise RuntimeError(f"Illumination solve did not converge at scale {step}")
        trace.append({"step": step, "iterations": iteration + 1, "maximumChange": error})
        previous = (size, channels)
    result = image.copy()
    output = result.load()
    mask = hidden.load()
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            if mask[x, y]:
                index = (y - box[1]) * columns + x - box[0]
                output[x, y] = tuple(max(0, min(255, round(channel[index]))) for channel in channels)
    return result, trace


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[3] / "apps/web/public/media/walk/orbit-cover.webp")
    parser.add_argument("--max-width", type=int, default=0)
    parser.add_argument("--lossless", action="store_true")
    parser.add_argument("--quality", type=int, default=92)
    args = parser.parse_args()
    with Image.open(args.source) as original:
        image = original.convert("RGB")
    if image.size not in SOURCE_SIZES:
        raise ValueError("Use the full 1671x941 original or archived 1600x901 landscape")
    sx, sy = image.width / REFERENCE_SIZE[0], image.height / REFERENCE_SIZE[1]
    box = tuple(round(v * (sx if i % 2 == 0 else sy)) for i, v in enumerate(CROP))
    rgb = image.crop(box)
    width, height = rgb.size
    hidden = Image.new("L", rgb.size)
    ImageDraw.Draw(hidden).polygon([(round(x * sx) - box[0], round(y * sy) - box[1]) for x, y in MONOLITH], fill=255)
    hidden = hidden.filter(ImageFilter.MaxFilter(13))
    rgb_pixels = rgb.load()
    repaired, solver = extend_illumination(rgb, hidden, sx)
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
    for source, result, mask in zip(rgb.get_flattened_data(), repaired.get_flattened_data(), hidden.get_flattened_data()):
        if not mask and source != result:
            raise AssertionError("An RGB pixel outside the repair mask changed")
    if args.max_width > 0 and rgba.width > args.max_width:
        target_height = max(1, round(rgba.height * args.max_width / rgba.width))
        rgba = rgba.resize((args.max_width, target_height), Image.Resampling.LANCZOS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(args.output, lossless=args.lossless, quality=args.quality, method=6, exact=False)
    with Image.open(args.output) as saved:
        decoded = saved.convert("RGBA")
        if decoded.size != rgba.size:
            raise AssertionError("Output dimensions changed during encoding")
        if args.lossless:
            for expected, actual in zip(rgba.get_flattened_data(), decoded.get_flattened_data()):
                if actual[3] != expected[3]:
                    raise AssertionError("An alpha value changed during encoding")
                if actual[3] and expected[:3] != actual[:3]:
                    raise AssertionError("A visible RGB pixel changed during encoding")
    center = ((CENTER[0] * sx - box[0]) / width, (CENTER[1] * sy - box[1]) / height)
    print(json.dumps({
        "asset": str(args.output), "size": [rgba.width, rgba.height], "sourceSize": image.size,
        "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "crop": list(box), "planetCenterUVTopLeft": center,
        "planetCenterUVBottomLeft": [center[0], 1 - center[1]],
        "planetRadiusPixels": RADIUS * sx,
        "ringUpperInOriginal": [787.5, -.470], "ringLowerInOriginal": [741, -.409],
        "sourceReferenceSize": REFERENCE_SIZE, "originalMonolithPolygon": MONOLITH,
        "alphaTreatment": "Continuous planet alpha; lower atmosphere fades at y360–505, left ring glow at x560–820, right ring at x1380–1671.",
        "occludedRgbTreatment": "Floating-point multiscale harmonic illumination solve, with neighboring original pixels fixed. No unseen cloud detail recovered or synthesized.",
        "solver": solver,
        "rgbPreservedOutsideRepairMask": True, "visibleDecodedPixelsLossless": bool(args.lossless),
        "transparentRgbDiscarded": True, "bytes": args.output.stat().st_size,
    }, indent=2))


if __name__ == "__main__":
    main()
