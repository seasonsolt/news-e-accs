// Production web server: built client assets, the shared redirect table and SSR. Api-owned paths are
// proxied to the api process, so one port serves the whole site; a reverse proxy in front may also send
// them to the api directly.
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequestListener } from "@react-router/node";
import type { ServerBuild } from "react-router";
import { isApiOwned, resolveRedirect } from "@aihot/contracts/http-policy";
import { BROWSER_MAX_SECONDS } from "./app/lib/api.server.ts";
import { proxyToApi } from "./app/lib/api-proxy.server.ts";
import { compressResponse } from "./app/lib/compress.server.ts";
import { logError } from "./app/lib/errors.server.ts";
import { serverTiming, withTiming } from "./app/lib/timing.server.ts";

const PORT = Number(process.env.WEB_PORT || 3000);
const HOST = process.env.WEB_HOST || "127.0.0.1";
/**
 * Whether a reverse proxy in front (Caddy, nginx) records the visitor in X-Forwarded-For. Without one
 * the header is never believed: a visitor could name any address and slip past the api's per-visitor
 * limits (sign-in attempts, feedback).
 */
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const CLIENT_DIR = path.resolve(import.meta.dirname, "build/client");
/**
 * Served behind an edge router (e-acc.ai's Worker): requests it forwards carry this secret in
 * x-eacc-edge and the visitor's address in x-eacc-client-ip. Requests that reach a legacy host
 * (LEGACY_HOSTS, e.g. news.e-accs.com) without it are sent to the same path on SITE_URL.
 */
const EDGE_SECRET = process.env.EDGE_SECRET ? Buffer.from(process.env.EDGE_SECRET) : null;
const LEGACY_HOSTS = new Set((process.env.LEGACY_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean));
const PUBLIC_ORIGIN = (process.env.SITE_URL || "").replace(/\/+$/, "");

function fromEdge(req: import("node:http").IncomingMessage): boolean {
  const given = req.headers["x-eacc-edge"];
  if (!EDGE_SECRET || typeof given !== "string") return false;
  const buf = Buffer.from(given);
  return buf.length === EDGE_SECRET.length && timingSafeEqual(buf, EDGE_SECRET);
}

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

// A file URL, not a path: on Windows import() reads "C:\..." as a URL with the scheme "c:".
const build: ServerBuild = await import(pathToFileURL(path.resolve(import.meta.dirname, "build/server/index.js")).href);
// Keep an empty result for pages without a loader. A tab opened before a page lost its loader still asks
// for that result, and its router rejects a missing one before React's release recovery can run; an empty
// one reaches the component instead. The client manifest declares no loader, so current documents make no
// such request. A tab updates only when its reader reloads it, so no date says when the last old one is
// gone: remove this once such requests stop arriving.
const routes = Object.fromEntries(Object.entries(build.routes).map(([id, route]) => [id,
  route?.module.default && !route.module.loader ? { ...route, module: { ...route.module, loader: () => null } } : route,
]));
const ssr = createRequestListener({ build: { ...build, routes }, mode: "production" });

class BadRequest extends Error {}

/**
 * Hashed build assets are immutable; media gets a long cache with revalidation, other files a short one.
 * A single byte range is honoured: Safari will not play a video whose server ignores Range.
 */
async function serveStatic(pathname: string, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<boolean> {
  if (pathname.includes("..") || pathname.endsWith("/")) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new BadRequest("malformed percent-encoding");
  }
  const file = path.join(CLIENT_DIR, decoded);
  if (!file.startsWith(CLIENT_DIR)) return false;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return false;
  const immutable = pathname.startsWith("/assets/");
  const etag = `W/"${info.size}-${info.mtimeMs.toString(36)}"`;
  const headers = {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": immutable ? "public, max-age=31536000, immutable"
      : pathname.startsWith("/media/") ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000" : "public, max-age=3600",
    "Last-Modified": info.mtime.toUTCString(),
    "ETag": etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  const m = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    // "bytes=a-b", "bytes=a-" or the suffix form "bytes=-n" (the last n bytes).
    const start = m[1] ? Number(m[1]) : Math.max(0, info.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${info.size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${info.size}` });
    if (req.method === "HEAD") res.end();
    else createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = req.headers["if-modified-since"];
  const notModified = ifNoneMatch !== undefined
    ? ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || tag.trim().replace(/^W\//, "") === etag.slice(2))
    : ifModifiedSince !== undefined && Math.floor(info.mtimeMs / 1000) * 1000 <= Date.parse(ifModifiedSince);
  if (notModified) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  res.writeHead(200, { ...headers, "Content-Length": info.size });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
  return true;
}

// One bad request must never take the process down: answer it and keep serving.
const server = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    const bad = error instanceof BadRequest || error instanceof URIError;
    if (!bad) logError(error, { msg: "web request failed", method: req.method, path: (req.url ?? "").split("?")[0]!.slice(0, 200) });
    if (res.headersSent) return res.destroy();
    res.writeHead(bad ? 400 : 500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(bad ? "Bad request" : "Internal error");
  });
});

/**
 * The one writer of page response headers: a route only says how long shared caches may keep it (cachedPage, edgeTtl).
 * Public navigation returns all matched loaders, so `_routes` never changes a cached answer.
 */
function pageResponse(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const target = req.url ?? "/";
  // An origin-form target is a path even when it starts with //, not a new URL authority.
  const url = new URL(target.startsWith("/") ? `http://web.local${target}` : target, "http://web.local");
  const pathname = decodeURIComponent(url.pathname).replace(/\.data$/, "");
  const publicRead = (req.method === "GET" || req.method === "HEAD") && !/^\/admin(?:\/|$)/i.test(pathname);
  if (publicRead && url.pathname.endsWith(".data")) {
    url.searchParams.delete("_routes");
    req.url = url.pathname + url.search;
  }

  // React Router uses the same route headers for HTML and single-fetch data. Apply the final
  // status here: a route's successful cache policy must never cache its error or action result.
  const writeHead = res.writeHead.bind(res);
  res.writeHead = ((status: number, messageOrHeaders?: string | import("node:http").OutgoingHttpHeaders, headers?: import("node:http").OutgoingHttpHeaders) => {
    const outgoing = typeof messageOrHeaders === "string" ? headers : messageOrHeaders;
    for (const [name, value] of Object.entries(outgoing ?? {})) if (value !== undefined) res.setHeader(name, value);
    // Download managers can treat prefetched .data with the unknown text/x-script type as a file.
    // Turbo-stream is text decoded from the response body; its client does not depend on the MIME.
    if (url.pathname.endsWith(".data") && res.getHeader("Content-Type") === "text/x-script") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    // URL fixes the edition; language preferences and onboarding are applied only in the browser.
    // Shared HTML and Router data must stay independent of cookies, Accept-Language and the user
    // agent, except for choosing the bot streaming mode (onAllReady vs onShellReady).
    const timing = serverTiming();
    if (timing) res.setHeader("Server-Timing", timing);
    const cc = String(res.getHeader("Cache-Control") ?? "");
    if (!publicRead || status !== 200 || res.hasHeader("Set-Cookie") || !cc || /(?:private|no-store)/i.test(cc)) {
      res.removeHeader("Expires");
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Accel-Expires", "0");
    } else {
      const now = new Date();
      const nowSeconds = Math.floor(now.getTime() / 1000);
      const sharedSeconds = Number(cc.match(/(?:^|,)\s*s-maxage=(\d+)/i)?.[1] ?? 0);
      const expires = String(res.getHeader("X-Accel-Expires") ?? `@${nowSeconds + sharedSeconds}`);
      // A sibling loader may have delayed this response after the selected loader set its TTL.
      const seconds = /(?:^|,)\s*no-cache(?:,|$)/i.test(cc) || expires === "0" ? 0
        : Math.max(0, Math.min(sharedSeconds, Number(expires.slice(1)) - nowSeconds));
      res.setHeader("Date", now.toUTCString());
      res.setHeader("X-Accel-Expires", seconds > 0 ? expires : "0");
      // Reuse intent-prefetched data in the browser within the same shared-cache deadline (capped).
      // Never serve it beyond that deadline, including while revalidating or on an error.
      res.setHeader("Cache-Control", seconds > 0
        ? `public, max-age=${Math.min(seconds, BROWSER_MAX_SECONDS)}, s-maxage=${seconds}, must-revalidate`
        : "no-cache");
    }
    return typeof messageOrHeaders === "string" ? writeHead(status, messageOrHeaders) : writeHead(status);
  }) as typeof res.writeHead;
}

async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const raw = req.url ?? "/";
  const qi = raw.indexOf("?");
  const pathname = qi >= 0 ? raw.slice(0, qi) : raw;
  const search = qi >= 0 ? raw.slice(qi) : "";
  const edge = fromEdge(req);
  compressResponse(req, res);
  const host = String(req.headers.host ?? "").split(":")[0]!.toLowerCase();
  if (!edge && PUBLIC_ORIGIN && LEGACY_HOSTS.has(host)) {
    res.writeHead(301, { Location: `${PUBLIC_ORIGIN}${pathname}${search}`, "Cache-Control": "public, max-age=86400" });
    return res.end();
  }
  // The edge's secret goes no further than this process.
  delete req.headers["x-eacc-edge"];
  // Cloudflare rewrites X-Forwarded-Host to the tunnel's hostname on the way in, so a request the edge
  // vouched for is restored to the public host here (the api's MCP endpoint checks it).
  if (edge && PUBLIC_ORIGIN) req.headers["x-forwarded-host"] = new URL(PUBLIC_ORIGIN).host;

  const decision = pathname.endsWith(".data") ? null : resolveRedirect(pathname, search);
  if (decision) {
    for (const [k, v] of Object.entries(decision.headers)) res.setHeader(k, v);
    if (decision.location) res.setHeader("Location", decision.location);
    res.statusCode = decision.status;
    return res.end(decision.location ? undefined : decision.status === 410 ? "Gone" : "Not found");
  }

  if (isApiOwned(pathname)) {
    // The visitor's address, decided here: the one the trusted proxy saw (the last X-Forwarded-For
    // entry), or this connection's own. Both headers carry only that.
    // Behind the edge router, the visitor is the address it reports (the proxy hop is the router itself).
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const edgeClient = edge ? String(req.headers["x-eacc-client-ip"] ?? "").trim().slice(0, 64) : "";
    const client = edgeClient || (TRUST_PROXY && forwarded.length ? forwarded[forwarded.length - 1]! : (req.socket.remoteAddress ?? ""));
    // The edge also reports the visitor's country (for the admin's reader counts); a request that did not come
    // through the edge cannot name one.
    const country = edge ? String(req.headers["x-eacc-country"] ?? "").trim().slice(0, 2) : "";
    // The edge's headers are consumed here, never passed on to the api as they came.
    delete req.headers["x-eacc-client-ip"];
    delete req.headers["x-eacc-country"];
    return proxyToApi(req, res, { "x-forwarded-for": client, "x-real-ip": client, "x-eacc-country": country });
  }

  if ((req.method === "GET" || req.method === "HEAD") && pathname.includes(".") && (await serveStatic(pathname, req, res))) return;
  pageResponse(req, res);
  return withTiming(() => ssr(req, res));
}

process.on("unhandledRejection", (reason) => {
  logError(reason, { msg: "unhandled rejection" });
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, HOST, () => {
  const port = (server.address() as import("node:net").AddressInfo).port;
  // An ephemeral local site learns its canonical origin only after the listener owns the port.
  if (process.env.SITE_URL) {
    const site = new URL(process.env.SITE_URL);
    if (site.port === "0") { site.port = String(port); process.env.SITE_URL = site.origin; }
  }
  console.log(JSON.stringify({ level: "info", msg: "web started", port, pid: process.pid }));
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
