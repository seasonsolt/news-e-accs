// Response compression for the production web server. Every response the origin sends crosses the tunnel
// to the edge, and uncompressed HTML was most of the server's outbound traffic (a 240 KB page is 37 KB in
// gzip). The edge decompresses for readers that need it, so the origin compresses whenever asked.
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { constants, createBrotliCompress, createGzip, type BrotliCompress, type Gzip } from "node:zlib";

/** Smaller bodies gain less than the encoding costs. */
const MIN_BYTES = 1024;
/** Text formats; event streams stay unbuffered for MCP. */
const COMPRESSIBLE = /^(?:text\/(?!event-stream)|application\/(?:json|javascript|xml|rss\+xml|atom\+xml|ld\+json|manifest\+json|x-ndjson)|image\/svg\+xml)/i;

type Encoding = "br" | "gzip";

/** The client's preferred encoding we can produce: brotli first, then gzip; `q=0` refuses one. */
export function chooseEncoding(header: string | string[] | undefined): Encoding | null {
  const accepted = new Map<string, number>();
  for (const part of String(header ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    accepted.set(name, q ? Number(q.slice(2)) || 0 : 1);
  }
  const wildcard = accepted.get("*");
  for (const encoding of ["br", "gzip"] as const) {
    if ((accepted.get(encoding) ?? wildcard ?? 0) > 0) return encoding;
  }
  return null;
}

function eligible(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === "HEAD" || res.statusCode < 200 || res.statusCode === 204 || res.statusCode === 206 || res.statusCode === 304) return false;
  if (res.hasHeader("Content-Encoding") || res.hasHeader("Content-Range")) return false;
  if (/(?:^|,)\s*no-transform\s*(?:,|$)/i.test(String(res.getHeader("Cache-Control") ?? ""))) return false;
  if (!COMPRESSIBLE.test(String(res.getHeader("Content-Type") ?? ""))) return false;
  const length = res.getHeader("Content-Length");
  return length === undefined || Number(length) >= MIN_BYTES;
}

/**
 * Compresses this response if the client accepts it and the body is text. It hooks the response's own
 * writeHead/write/end, so SSR, the api proxy and static files are all covered whatever wrote the headers.
 * Output is flushed once per turn of the event loop: a streamed page still reaches the reader in parts,
 * while the many small chunks of one render burst are compressed together.
 */
export function compressResponse(req: IncomingMessage, res: ServerResponse): void {
  const encoding = chooseEncoding(req.headers["accept-encoding"]);
  if (!encoding) return;

  const writeHead = res.writeHead.bind(res);
  const rawWrite = res.write;
  const rawEnd = res.end;
  const write = (chunk: Buffer): boolean => Reflect.apply(rawWrite, res, [chunk]);
  const end = (): void => void Reflect.apply(rawEnd, res, []);
  let zip: Gzip | BrotliCompress | null = null;
  let decided = false;
  let flushQueued = false;

  const decide = () => {
    if (decided || res.headersSent) return;
    decided = true;
    if (!eligible(req, res)) return;
    const vary = String(res.getHeader("Vary") ?? "");
    if (!/(?:^|,)\s*(?:accept-encoding|\*)\s*(?:,|$)/i.test(vary)) res.setHeader("Vary", vary ? `${vary}, Accept-Encoding` : "Accept-Encoding");
    res.removeHeader("Content-Length");
    res.setHeader("Content-Encoding", encoding);
    const etag = res.getHeader("ETag");
    if (typeof etag === "string" && etag.startsWith("\"")) res.setHeader("ETag", `W/${etag}`);
    zip = encoding === "br"
      ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
      : createGzip({ level: 6 });
    const stream = zip;
    stream.on("data", (chunk: Buffer) => {
      if (!write(chunk)) stream.pause();
    });
    res.on("drain", () => stream.resume());
    // Writers wait for the response's drain; with a compressor between, that means the compressor's.
    stream.on("drain", () => res.emit("drain"));
    stream.on("end", () => end());
    stream.on("error", (error) => res.destroy(error));
    res.on("close", () => stream.destroy());
  };

  res.writeHead = ((status: number, reasonOrHeaders?: string | OutgoingHttpHeaders, maybeHeaders?: OutgoingHttpHeaders) => {
    const headers = typeof reasonOrHeaders === "string" ? maybeHeaders : reasonOrHeaders;
    res.statusCode = status;
    for (const [name, value] of Object.entries(headers ?? {})) if (value !== undefined) res.setHeader(name, value);
    decide();
    return typeof reasonOrHeaders === "string" ? writeHead(status, reasonOrHeaders) : writeHead(status);
  }) as typeof res.writeHead;

  res.write = ((...args: Parameters<typeof res.write>) => {
    decide();
    if (!zip) return Reflect.apply(rawWrite, res, args);
    if (!flushQueued) {
      flushQueued = true;
      const stream = zip;
      setImmediate(() => {
        flushQueued = false;
        if (!stream.writableEnded && !stream.destroyed) stream.flush();
      });
    }
    return Reflect.apply(zip.write, zip, args);
  }) as typeof res.write;

  res.end = ((...args: unknown[]) => {
    decide();
    if (!zip) return Reflect.apply(rawEnd, res, args);
    const done = args.find((a) => typeof a === "function") as (() => void) | undefined;
    if (done) res.once("finish", done);
    const [chunk, encoding] = args;
    if (chunk !== undefined && chunk !== null && typeof chunk !== "function") zip.end(chunk, typeof encoding === "string" ? encoding as BufferEncoding : "utf8");
    else zip.end();
    return res;
  }) as typeof res.end;
}
