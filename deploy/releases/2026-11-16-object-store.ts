// One-off copy: the essays' and the 公众号 column's pictures from AIHOT_DATA_DIR/uploads/ into the object store
// (OBJECT_STORE_*, lib/objects.ts), read back and compared. Reads local files and writes the bucket only;
// local files are kept. Safe to run again. Run from the release root right after upgrading:
//   node --env-file=/srv/eacc/.env deploy/releases/2026-11-16-object-store.ts [--apply]
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../packages/backend/src/config.ts";
import { getObject, objectStoreRemote, putObject } from "../../packages/backend/src/lib/objects.ts";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply")) throw new Error("Only --apply is supported; without it this is read-only");
const apply = args.includes("--apply");
if (!objectStoreRemote()) throw new Error("OBJECT_STORE_* is not configured: there is no bucket to copy into");

const FILE = /^[0-9a-f]{32}\.jpg$/;
let copied = 0, present = 0, skipped = 0;
for (const folder of ["essays", "wechat-illustrations"]) {
  const dir = path.join(config.dataDir, "uploads", folder);
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  for (const name of names.sort()) {
    if (!FILE.test(name)) { skipped += 1; console.log(`skip ${folder}/${name} (not a stored picture)`); continue; }
    const key = `${folder}/${name}`;
    const bytes = await readFile(path.join(dir, name));
    const stored = await getObject(key);
    if (stored?.equals(bytes)) { present += 1; continue; }
    if (!apply) { copied += 1; console.log(`would copy ${key} (${bytes.length} bytes)`); continue; }
    await putObject(key, bytes, "image/jpeg");
    if (!(await getObject(key))?.equals(bytes)) throw new Error(`read-back of ${key} does not match`);
    copied += 1;
    console.log(`copied ${key}`);
  }
}
console.log(`${apply ? "copied" : "to copy"}: ${copied}, already in the bucket: ${present}, skipped: ${skipped}${apply ? "" : " (read-only; add --apply)"}`);
