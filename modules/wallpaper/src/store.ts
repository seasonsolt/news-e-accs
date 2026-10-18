// The 4K files live in a private S3-compatible bucket (Cloudflare R2 in production) when WALLPAPER_STORE_* is
// set: R2 serves them without egress charges, so repeat downloads don't use the server's traffic. Downloads
// are checked and charged by the API, then redirected to a short-lived signed URL. Without the settings
// (development, tests, a fresh site) the files stay on local disk next to the previews.
import { createHash } from "node:crypto";
import { credential } from "@aihot/backend/config";
import { presignV4, signV4 } from "@aihot/backend/lib/s3";

const REGION = "auto";
const LINK_SECONDS = 300;

function settings() {
  const get = (k: string) => process.env[k] || credential("integrations", k) || null;
  const endpoint = get("WALLPAPER_STORE_ENDPOINT");
  const bucket = get("WALLPAPER_STORE_BUCKET");
  const accessKey = get("WALLPAPER_STORE_ACCESS_KEY_ID");
  const secretKey = get("WALLPAPER_STORE_SECRET_ACCESS_KEY");
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { base: `${endpoint.replace(/\/+$/, "")}/${bucket}/`, accessKey, secretKey };
}

export const remote = () => settings() !== null;

export async function put(name: string, bytes: Buffer): Promise<void> {
  const s = settings()!;
  const url = new URL(name, s.base);
  const headers = signV4({ method: "PUT", url, region: REGION, accessKey: s.accessKey, secretKey: s.secretKey,
    payloadHash: createHash("sha256").update(bytes).digest("hex"), headers: { "content-length": String(bytes.length), "content-type": "image/jpeg" } });
  const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(bytes), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`wallpaper store PUT ${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** A signed GET for one file, valid for five minutes, that saves under `filename`. */
export function link(name: string, filename: string): string {
  const s = settings()!;
  const url = new URL(name, s.base);
  url.searchParams.set("response-content-disposition", `inline; filename="${filename}"`);
  return presignV4({ url, region: REGION, accessKey: s.accessKey, secretKey: s.secretKey, expires: LINK_SECONDS }).toString();
}
