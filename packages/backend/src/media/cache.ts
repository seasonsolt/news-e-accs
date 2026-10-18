// API-side prepared image reads never decode metadata, fetch originals or retain a byte cache.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
export const SVG_PASSTHROUGH_MAX_BYTES = 128 * 1024;
export class ImageBudgetExceeded extends Error {}
export interface PreparedImage { body: Buffer; type: string; pendingAnimation?: boolean }
export function imageCacheFile(url: string, mode: string): string {
  const key = createHash("sha256").update(`${mode}|${url}`).digest("hex");
  return path.join(config.dataDir, "imgcache", key.slice(0, 2), key);
}
export async function readPreparedImage(url: string, mode: string): Promise<PreparedImage | null> {
  const file = imageCacheFile(url, mode);
  try {
    const [body, savedType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
    // A converter publishes body/type separately; identify either side of that transition by magic.
    const webp = body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
    const type = webp ? "image/webp"
      : /^GIF8[79]a/.test(body.toString("ascii", 0, 6)) ? "image/gif"
      : body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "image/png"
      : body[0] === 255 && body[1] === 216 ? "image/jpeg" : savedType;
    // An old body paired with a newly published WebP MIME needs worker metadata repair.
    if (savedType === "image/webp" && !webp && type === savedType) return null;
    const prepared = await readFile(`${file}.prepared`).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw error;
    });
    if (type === "image/svg+xml" && body.length > SVG_PASSTHROUGH_MAX_BYTES && !prepared) return null;
    if (type !== "image/gif" || prepared) return { body, type };
    // Old GIF cache entries need one worker metadata read to establish the animation budget.
    const pending = await readFile(`${file}.animation`, "utf8");
    return { body, type, ...(pending === "pending" ? { pendingAnimation: true } : {}) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
