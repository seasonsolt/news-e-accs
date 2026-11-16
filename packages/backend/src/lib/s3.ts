// AWS Signature V4 for S3-compatible object stores (Tencent COS for backups, Cloudflare R2 for the object store in lib/objects.ts).
import { createHash, createHmac } from "node:crypto";

const hex = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const amzNow = (now: Date) => now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function signature(secretKey: string, day: string, region: string, toSign: string): string {
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), "s3"), "aws4_request");
  return createHmac("sha256", kSigning).update(toSign).digest("hex");
}
function canonicalRequest(method: string, url: URL, headers: Record<string, string>, payloadHash: string): { names: string[]; canonical: string } {
  const names = Object.keys(headers).sort();
  const query = [...url.searchParams.entries()].map(([k, v]) => [rfc3986(k), rfc3986(v)]).sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
  const pathname = url.pathname.split("/").map((s) => rfc3986(decodeURIComponent(s))).join("/");
  return { names, canonical: [method, pathname, query, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), payloadHash].join("\n") };
}

/** Signature V4 headers for one S3 request. */
export function signV4(opts: {
  method: string; url: URL; region: string; accessKey: string; secretKey: string; payloadHash: string; headers?: Record<string, string>; now?: Date;
}): Record<string, string> {
  const amzDate = amzNow(opts.now ?? new Date());
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = Object.fromEntries(Object.entries({ ...(opts.headers ?? {}), host: opts.url.host, "x-amz-content-sha256": opts.payloadHash, "x-amz-date": amzDate }).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const scope = `${day}/${opts.region}/s3/aws4_request`;
  const { names, canonical } = canonicalRequest(opts.method, opts.url, headers, opts.payloadHash);
  const sig = signature(opts.secretKey, day, opts.region, ["AWS4-HMAC-SHA256", amzDate, scope, hex(canonical)].join("\n"));
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` };
}

/** A presigned GET URL (signature in the query string), valid for `expires` seconds. */
export function presignV4(opts: {
  url: URL; region: string; accessKey: string; secretKey: string; expires: number; now?: Date;
}): URL {
  const amzDate = amzNow(opts.now ?? new Date());
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${opts.region}/s3/aws4_request`;
  const url = new URL(opts.url);
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${opts.accessKey}/${scope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(opts.expires));
  url.searchParams.set("X-Amz-SignedHeaders", "host");
  const { canonical } = canonicalRequest("GET", url, { host: url.host }, "UNSIGNED-PAYLOAD");
  url.searchParams.set("X-Amz-Signature", signature(opts.secretKey, day, opts.region, ["AWS4-HMAC-SHA256", amzDate, scope, hex(canonical)].join("\n")));
  return url;
}
