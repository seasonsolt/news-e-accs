#!/usr/bin/env python3
"""Upscale audited Chronicle PNGs with the local wallpaper model, preserving their framing.

    python3 tools/upscale-chronicle.py SOURCE_AUDIT --binary /path/to/realesrgan-ncnn-vulkan

Requires Pillow, cwebp and realesrgan-x4plus.bin/.param beside the executable in models/.
Outputs 3840-wide WebP plates and smaller enhanced variants; the existing
800/1600/depth files are not modified.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MODEL = "realesrgan-x4plus"
WIDTH = 3840
QUALITY = 78
DERIVATIVE_WIDTHS = (800, 1600)
DERIVATIVE_QUALITY = 82


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def dimensions(path):
    with Image.open(path) as image:
        image.load()
        return image.size


def save_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def output_info(path, source_size, target_width=WIDTH):
    width, height = dimensions(path)
    expected_height = target_width * source_size[1] / source_size[0]
    if width != target_width or abs(height - expected_height) > 1:
        raise ValueError(f"invalid output size {width}x{height}: {path}")
    return {"width": width, "height": height, "sha256": sha256(path), "bytes": path.stat().st_size}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=2)
    parser.add_argument("--state-dir", type=Path, default=ROOT / ".data/chronicle-upscale")
    parser.add_argument("--only", action="append", default=[], help="Limit the run to an art key (repeatable).")
    args = parser.parse_args()
    started = time.monotonic()
    binary = args.binary.resolve()
    cwebp = shutil.which("cwebp")
    if not binary.is_file() or not os.access(binary, os.X_OK) or not cwebp:
        raise ValueError("an executable Real-ESRGAN binary and cwebp are required")
    models = binary.parent / "models"
    model_files = [models / f"{MODEL}.{extension}" for extension in ("bin", "param")]
    profile = {
        "model": MODEL, "scale": 4, "width": WIDTH, "quality": QUALITY,
        "binarySha256": sha256(binary),
        "modelFiles": {file.name: sha256(file) for file in model_files},
        "cwebpSha256": sha256(Path(cwebp).resolve()),
    }
    profile_hash = hashlib.sha256(json.dumps(profile, sort_keys=True).encode()).hexdigest()
    state_dir = args.state_dir.resolve()
    state_dir.mkdir(parents=True, exist_ok=True)
    logs = state_dir / "jobs"
    logs.mkdir(exist_ok=True)
    temporary_root = state_dir / "tmp"
    temporary_root.mkdir(exist_ok=True)
    state_path = state_dir / "checkpoint.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {"completed": {}}
    state["profile"] = profile
    state["profileSha256"] = profile_hash
    state["failures"] = []
    audit = json.loads(args.manifest.read_text())
    audited_plates = [(plate["group"], plate["art"]) for plate in audit["audit"]]
    current_plates = set()
    for group, kind in (("epochs", "eras"), ("moments", "milestones")):
        current = json.loads((ROOT / "industry/chronicle" / f"{kind}.json").read_text())
        current_plates.update((group, plate["art"]) for plate in current[kind] if plate.get("art"))
    if len(audited_plates) != len(set(audited_plates)):
        raise ValueError("the source audit contains duplicate group/art keys")
    missing = sorted(current_plates - set(audited_plates))
    extra = sorted(set(audited_plates) - current_plates)
    if missing or extra:
        raise ValueError(f"source audit coverage differs from the current Chronicle: missing={missing}, extra={extra}")
    source_jobs = {}
    seen_outputs = set()
    selected_keys = set(args.only)
    matched_keys = set()
    for plate in audit["audit"]:
        group, art = plate["group"], plate["art"]
        if selected_keys and art not in selected_keys:
            continue
        matched_keys.add(art)
        if group not in ("epochs", "moments") or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", art):
            raise ValueError(f"unsafe plate key: {group}/{art}")
        source = Path(plate["source"]["path"]).expanduser()
        if not source.is_absolute():
            source = ROOT / source
        expected_hash = plate["source"]["sha256"]
        current = ROOT / "apps/web/public/media/art" / group / f"{art}-1600.webp"
        if sha256(current) != plate["currentSha256"]:
            raise ValueError(f"the current plate has changed since the source audit: {group}/{art}")
        output = ROOT / "apps/web/public/media/art" / group / f"{art}-3840.webp"
        relative = str(output.relative_to(ROOT))
        if relative in seen_outputs:
            raise ValueError(f"duplicate output: {relative}")
        seen_outputs.add(relative)
        job = source_jobs.setdefault(expected_hash, {"source": source, "sourceSha256": expected_hash, "outputs": []})
        job["outputs"].append(relative)
    if selected_keys - matched_keys:
        raise ValueError(f"unknown art keys: {sorted(selected_keys - matched_keys)}")
    if not source_jobs:
        raise ValueError("the manifest selected no plates")
    for job in source_jobs.values():
        if sha256(job["source"]) != job["sourceSha256"]:
            raise ValueError(f"source SHA does not match the audit: {job['source']}")
        job["sourceSize"] = dimensions(job["source"])

    def resumed(job):
        previous = state["completed"].get(job["sourceSha256"])
        if not previous or previous.get("profileSha256") != profile_hash:
            return False
        try:
            return all(output_info(ROOT / relative, job["sourceSize"]) == previous["outputs"][relative]
                       for relative in job["outputs"])
        except (OSError, ValueError, KeyError):
            return False

    pending = [job for job in source_jobs.values() if not resumed(job)]
    completed = len(source_jobs) - len(pending)
    print(f"START pid={os.getpid()} sources={len(source_jobs)} outputs={len(seen_outputs)} "
          f"resumed={completed} pending={len(pending)} jobs={args.jobs}", flush=True)
    save_json(state_dir / "run.json", {"pid": os.getpid(), "sources": len(source_jobs), "outputs": len(seen_outputs),
                                     "jobs": args.jobs, "manifest": str(args.manifest.resolve())})
    save_json(state_path, state)

    def process(job):
        job_started = time.monotonic()
        source_hash = job["sourceSha256"]
        log_path = logs / f"{source_hash}.log"
        with tempfile.TemporaryDirectory(prefix=f"{source_hash[:12]}-", dir=temporary_root) as temporary:
            temporary = Path(temporary)
            upscaled = temporary / "x4.png"
            with log_path.open("w") as log:
                command = [str(binary), "-i", str(job["source"]), "-o", str(upscaled),
                           "-n", MODEL, "-m", str(models), "-s", "4"]
                result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
                if result.returncode != 0 or not upscaled.is_file():
                    raise RuntimeError(f"upscaler failed ({result.returncode}); see {log_path}")
                if dimensions(upscaled) != tuple(value * 4 for value in job["sourceSize"]):
                    raise RuntimeError(f"upscaler did not produce the required 4x image; see {log_path}")
                webp = temporary / "plate.webp"
                subprocess.run([cwebp, "-quiet", "-q", str(QUALITY), "-resize", str(WIDTH), "0",
                                str(upscaled), "-o", str(webp)], stdout=log, stderr=subprocess.STDOUT, check=True)
            info = output_info(webp, job["sourceSize"])
            outputs = {}
            for relative in job["outputs"]:
                output = ROOT / relative
                temporary_output = output.with_suffix(".webp.tmp")
                shutil.copyfile(webp, temporary_output)
                temporary_output.replace(output)
                outputs[relative] = dict(info)
        return {"source": str(job["source"]), "sourceSha256": source_hash, "sourceSize": job["sourceSize"],
                "profileSha256": profile_hash, "model": profile, "outputs": outputs,
                "elapsedSeconds": round(time.monotonic() - job_started, 2)}

    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = {executor.submit(process, job): job for job in pending}
        for future in as_completed(futures):
            job = futures[future]
            try:
                record = future.result()
            except Exception as error:
                state["failures"].append({"source": str(job["source"]), "sourceSha256": job["sourceSha256"],
                                          "error": str(error)})
                save_json(state_path, state)
                for queued in futures:
                    queued.cancel()
                print(f"FAILED source={job['source']} error={error}", file=sys.stderr, flush=True)
                raise
            state["completed"][job["sourceSha256"]] = record
            save_json(state_path, state)
            completed += 1
            print(f"DONE {completed}/{len(source_jobs)} source={job['source'].name} "
                  f"outputs={len(record['outputs'])} job={record['elapsedSeconds']:.1f}s "
                  f"elapsed={time.monotonic() - started:.1f}s", flush=True)

    for job in source_jobs.values():
        if not resumed(job):
            raise RuntimeError(f"final output verification failed: {job['source']}")
    print(f"VERIFIED sources={len(source_jobs)} outputs={len(seen_outputs)} width={WIDTH} "
          f"elapsed={time.monotonic() - started:.1f}s", flush=True)

    # Keep the old public URLs untouched. The smaller enhanced cuts let screens that
    # do not need a 3840-pixel image benefit from the same source enhancement.
    derivative_profile = {"widths": DERIVATIVE_WIDTHS, "quality": DERIVATIVE_QUALITY,
                          "cwebpSha256": profile["cwebpSha256"]}
    derivative_hash = hashlib.sha256(json.dumps(derivative_profile, sort_keys=True).encode()).hexdigest()
    derivatives = state.setdefault("derivatives", {})

    def derivative_path(relative, width):
        return relative.removesuffix("-3840.webp") + f"-hd-{width}.webp"

    def derivative_resumed(job):
        previous = derivatives.get(job["sourceSha256"])
        primary = state["completed"][job["sourceSha256"]]["outputs"][job["outputs"][0]]["sha256"]
        if not previous or previous.get("profileSha256") != derivative_hash or previous.get("primarySha256") != primary:
            return False
        try:
            return all(output_info(ROOT / derivative_path(relative, width), job["sourceSize"], width) ==
                       previous["outputs"][derivative_path(relative, width)]
                       for relative in job["outputs"] for width in DERIVATIVE_WIDTHS)
        except (OSError, ValueError, KeyError):
            return False

    def derive(job):
        outputs = {}
        primary = ROOT / job["outputs"][0]
        with tempfile.TemporaryDirectory(prefix=f"derivative-{job['sourceSha256'][:12]}-", dir=temporary_root) as temporary:
            for width in DERIVATIVE_WIDTHS:
                webp = Path(temporary) / f"{width}.webp"
                subprocess.run([cwebp, "-quiet", "-q", str(DERIVATIVE_QUALITY), "-resize", str(width), "0",
                                str(primary), "-o", str(webp)], check=True)
                info = output_info(webp, job["sourceSize"], width)
                for relative in job["outputs"]:
                    destination = derivative_path(relative, width)
                    output = ROOT / destination
                    temporary_output = output.with_suffix(".webp.tmp")
                    shutil.copyfile(webp, temporary_output)
                    temporary_output.replace(output)
                    outputs[destination] = dict(info)
        return {"profileSha256": derivative_hash, "primarySha256": sha256(primary), "outputs": outputs}

    derivative_pending = [job for job in source_jobs.values() if not derivative_resumed(job)]
    derivative_completed = len(source_jobs) - len(derivative_pending)
    print(f"DERIVATIVES sources={len(source_jobs)} resumed={derivative_completed} pending={len(derivative_pending)}", flush=True)
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = {executor.submit(derive, job): job for job in derivative_pending}
        for future in as_completed(futures):
            job = futures[future]
            try:
                record = future.result()
            except Exception as error:
                state["failures"].append({"source": str(job["source"]), "sourceSha256": job["sourceSha256"],
                                          "stage": "derivatives", "error": str(error)})
                save_json(state_path, state)
                for queued in futures:
                    queued.cancel()
                print(f"FAILED derivatives source={job['source']} error={error}", file=sys.stderr, flush=True)
                raise
            derivatives[job["sourceSha256"]] = record
            save_json(state_path, state)
            derivative_completed += 1
            print(f"DERIVED {derivative_completed}/{len(source_jobs)} source={job['source'].name}", flush=True)

    for job in source_jobs.values():
        if not derivative_resumed(job):
            raise RuntimeError(f"final derivative verification failed: {job['source']}")
    print(f"VERIFIED DERIVATIVES sources={len(source_jobs)} outputs={len(seen_outputs) * len(DERIVATIVE_WIDTHS)}", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
