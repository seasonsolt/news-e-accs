// Builds a scene's textures and uploads them to R2 (modules/scenes/README.md).
//
//   node modules/scenes/scripts/assets.ts build <scene>    originals → apps/web/public/media/scenes/<scene>/ + manifest.json
//   node modules/scenes/scripts/assets.ts upload <scene>   the manifest's files → R2 e-acc/scenes/<scene>/
//
// `build` reads each original listed in assets/<scene>/sources.json from .data/scene-sources/<scene>/,
// fetching it first when it is missing (from its public address, or from the bucket's private
// scene-sources/ prefix) and refusing one whose MD5 differs. It writes WebP files named after their
// content, so a changed texture gets a new address and every address can be cached for good, and
// records them in web/<scene>/manifest.json, which the scene's code reads. `upload` needs the cf CLI signed in.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const BUCKET = "e-acc";

interface Source {
  name: string;
  source: string;
  md5: string;
  width: number;
  quality: number;
  /** A public address the original is fetched from. */
  url?: string;
  /** Or its key in the bucket, under the private scene-sources/ prefix. */
  r2?: string;
}

const [command, scene] = process.argv.slice(2);
if (!(command === "build" || command === "upload") || !scene || !/^[a-z0-9-]+$/.test(scene)) {
  throw new Error("usage: node modules/scenes/scripts/assets.ts build|upload <scene>");
}
const manifestFile = path.join(ROOT, "modules/scenes/web", scene, "manifest.json");
const outDir = path.join(ROOT, "apps/web/public/media/scenes", scene);
const cf = (args: string[], options: { encoding?: "utf8" } = {}) =>
  execFileSync("npx", ["cf", ...args], { cwd: path.join(ROOT, "deploy/edge"), maxBuffer: 64 * 1024 * 1024, ...options });
const md5 = (data: Buffer) => createHash("md5").update(data).digest("hex");

async function original(item: Source): Promise<Buffer> {
  const file = path.join(ROOT, ".data/scene-sources", scene!, item.source);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    if (item.url) {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`${item.source}: ${response.status} from ${item.url}`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    } else if (item.r2) {
      writeFileSync(file, cf(["r2", "objects", "get", item.r2, "--bucket-name", BUCKET]));
    } else {
      throw new Error(`${item.source}: not in .data/scene-sources/${scene} and has neither url nor r2`);
    }
  }
  const data = readFileSync(file);
  if (md5(data) !== item.md5) throw new Error(`${item.source}: MD5 ${md5(data)} is not the recorded ${item.md5}`);
  return data;
}

async function build() {
  const sources = JSON.parse(readFileSync(path.join(ROOT, "modules/scenes/assets", scene!, "sources.json"), "utf8")) as Source[];
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const manifest: Record<string, string> = {};
  for (const item of sources) {
    const webp = await sharp(await original(item))
      .resize({ width: item.width, withoutEnlargement: true })
      .webp({ quality: item.quality, effort: 6 })
      .toBuffer();
    const name = `${item.name}.${createHash("sha256").update(webp).digest("hex").slice(0, 10)}.webp`;
    writeFileSync(path.join(outDir, name), webp);
    manifest[item.name] = name;
    console.log(`${name}  ${(webp.length / 1024).toFixed(0)} KB`);
  }
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

function upload() {
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, string>;
  const built = new Set(existsSync(outDir) ? readdirSync(outDir) : []);
  for (const name of Object.values(manifest)) {
    if (!built.has(name)) throw new Error(`${name} is in the manifest but not built; run build first`);
  }
  for (const name of Object.values(manifest)) {
    cf(["r2", "objects", "put", `scenes/${scene}/${name}`, "--bucket-name", BUCKET, "--file", path.join(outDir, name), "--content-type", "image/webp", "-q"], { encoding: "utf8" });
    console.log(`uploaded scenes/${scene}/${name}`);
  }
}

if (command === "build") await build();
else upload();
