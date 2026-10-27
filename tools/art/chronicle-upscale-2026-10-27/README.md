# Chronicle 3840-pixel artwork batch

The 3840-wide plates were made from the original, unwatermarked PNG illustrations with the local wallpaper pipeline's Real-ESRGAN `realesrgan-x4plus` model. Each image is enlarged 4×, then encoded as WebP at width 3840 and quality 78. The 800- and 1600-pixel enhanced variants are downsampled from that plate at quality 82. Original aspect ratio and framing are preserved; no wallpaper crop, watermark or grain is added. These are enhanced illustrations, not native 4K originals.

`manifest.json` records the source PNG and the SHA-256 of both it and the previously published 1600-pixel plate for each era or milestone. Paths under `tools/` are relative to the repository; `~/Desktop/eacc-art/` refers to original local files, which are not included in the repository. Those originals must be preserved separately to reproduce the batch. The manifest also records the output and tool hashes from this run.

To run or resume the batch, install Pillow and `cwebp`, and place the official `realesrgan-ncnn-vulkan` executable beside its `models/` directory containing `realesrgan-x4plus.bin` and `.param`:

```sh
python3 tools/upscale-chronicle.py tools/art/chronicle-upscale-2026-10-27/manifest.json \
  --binary .data/chronicle-upscale/tool/realesrgan-ncnn-vulkan
```

The script checks that the manifest covers the current Chronicle data, verifies source and 1600-pixel hashes, and saves a resumable checkpoint under `.data/chronicle-upscale/`. It validates each decoded output's dimensions and hash. `--only ART_KEY` limits processing to selected keys; update and audit the manifest when adding or replacing artwork. Enhanced smaller variants use new `-hd-800.webp` and `-hd-1600.webp` names; the existing 800/1600 and depth files are not modified. If the processing steps in the script change, use a new `--state-dir`: the checkpoint tracks model and encoder hashes and settings, not the script's source code.
