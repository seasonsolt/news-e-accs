// Files the api and the worker both read or write (pictures the worker draws or finds, the editor's uploads,
// wallpaper originals), each under a key such as "essays/<hash>.jpg". With OBJECT_STORE_* set they live in a
// private S3-compatible bucket (Cloudflare R2 in production), so the api and the worker need not share a disk;
// without it (development, tests, a fresh site) they are files at AIHOT_DATA_DIR/uploads/<key>, which the
// uploads backup keeps.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config, credential } from "../config.ts";
import { presignV4, signV4 } from "./s3.ts";

const REGION = "auto";
const EMPTY_PAYLOAD = createHash("sha256").update("").digest("hex");
/** A folder and a file name: nothing that could leave the folder or the bucket. */
const KEY = /^[a-z0-9-]+\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function bucket() {
  const get = (name: string) => credential("integrations", name);
  const endpoint = get("OBJECT_STORE_ENDPOINT");
  const name = get("OBJECT_STORE_BUCKET");
  const accessKey = get("OBJECT_STORE_ACCESS_KEY_ID");
  const secretKey = get("OBJECT_STORE_SECRET_ACCESS_KEY");
  if (!endpoint || !name || !accessKey || !secretKey) return null;
  return { base: `${endpoint.replace(/\/+$/, "")}/${name}/`, accessKey, secretKey };
}

/** Storing failed (the bucket or the disk), as opposed to the bytes being unusable. */
export class ObjectStoreError extends Error {}

/** Whether objects live in the bucket rather than on this machine's disk. */
export const objectStoreRemote = () => bucket() !== null;

function checked(key: string): string {
  if (!KEY.test(key)) throw new Error(`invalid object key: ${key}`);
  return key;
}

const localFile = (key: string) => path.join(config.dataDir, "uploads", key);

export async function putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  checked(key);
  const b = bucket();
  try {
    if (!b) {
      await mkdir(path.dirname(localFile(key)), { recursive: true });
      await writeFile(localFile(key), bytes);
      return;
    }
    const url = new URL(key, b.base);
    const headers = signV4({ method: "PUT", url, region: REGION, accessKey: b.accessKey, secretKey: b.secretKey,
      payloadHash: createHash("sha256").update(bytes).digest("hex"), headers: { "content-length": String(bytes.length), "content-type": contentType } });
    const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(bytes), signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (error) {
    throw new ObjectStoreError(`object store PUT ${key}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** The object's bytes; null when there is none. */
export async function getObject(key: string): Promise<Buffer | null> {
  checked(key);
  const b = bucket();
  if (!b) {
    try {
      return await readFile(localFile(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  const url = new URL(key, b.base);
  const headers = signV4({ method: "GET", url, region: REGION, accessKey: b.accessKey, secretKey: b.secretKey, payloadHash: EMPTY_PAYLOAD });
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`object store GET ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** A signed GET for one object in the bucket, valid for `seconds`, that saves under `filename`. Only with a bucket. */
export function objectLink(key: string, filename: string, seconds: number): string {
  checked(key);
  const b = bucket();
  if (!b) throw new Error("OBJECT_STORE_* is not configured");
  const url = new URL(key, b.base);
  url.searchParams.set("response-content-disposition", `inline; filename="${filename}"`);
  return presignV4({ url, region: REGION, accessKey: b.accessKey, secretKey: b.secretKey, expires: seconds }).toString();
}
