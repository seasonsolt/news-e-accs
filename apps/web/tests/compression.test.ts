// Run after `npm run build -w @aihot/web`. The production server compresses text it sends (SSR pages, the
// api it proxies, static files) when asked, and leaves alone what must stay as is: ranges, HEAD, tiny
// bodies, event streams, and clients that did not ask.
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync, createGunzip, gunzipSync } from "node:zlib";
import { chooseEncoding } from "../app/lib/compress.server.ts";
import { startWebServer, type WebServer } from "./web-server.ts";

const bigJson = JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ id: i, title: `Item ${i}` })) });
let releaseStream: () => void = () => {};

const api = createServer((req, res) => {
  if (req.url === "/api/site/meta") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ changelogVersion: null }));
  }
  if (req.url?.startsWith("/api/site/timeline")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ cards: [], nextCursor: null, dayCounts: {}, hot: [], filters: { category: null, channel: null, tag: null } }));
  }
  if (req.url === "/api/site/big") {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bigJson), "Vary": "Origin", "ETag": "\"v1\"" });
    return res.end(bigJson);
  }
  if (req.url === "/api/site/small") {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Length": 2 });
    return res.end("{}");
  }
  if (req.url === "/api/site/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    return res.end("data: " + "x".repeat(4000) + "\n\n");
  }
  if (req.url === "/api/site/stream") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.write("first part\n".repeat(200));
    releaseStream = () => res.end("second part\n");
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end("{}");
});

let web: WebServer;
before(async () => { web = await startWebServer(api); });
after(() => web.stop());

/** Route data embeds its cache deadline to the second; two renders may straddle one. */
const stable = (html: string) => html.replace(/expiresAt\\",\d+/g, "expiresAt\\\",0");

function get(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: web.port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("the preferred encoding honours q=0 and wildcards", () => {
  assert.equal(chooseEncoding("gzip, deflate, br"), "br");
  assert.equal(chooseEncoding("gzip"), "gzip");
  assert.equal(chooseEncoding("br;q=0, gzip;q=0.5"), "gzip");
  assert.equal(chooseEncoding("*"), "br");
  assert.equal(chooseEncoding("identity"), null);
  assert.equal(chooseEncoding(undefined), null);
});

test("server-rendered pages are compressed with brotli or gzip and decode to the same page", async () => {
  const plain = await get("/");
  assert.equal(plain.status, 200);
  assert.equal(plain.headers["content-encoding"], undefined);
  const html = plain.body.toString("utf8");
  assert.match(html, /^<!DOCTYPE html>/i);

  const br = await get("/", { "Accept-Encoding": "gzip, br" });
  assert.equal(br.headers["content-encoding"], "br");
  assert.match(String(br.headers.vary), /Accept-Encoding/);
  assert.equal(br.headers["content-length"], undefined);
  assert.ok(br.body.length < html.length / 3, `brotli ${br.body.length} vs plain ${html.length}`);
  assert.equal(stable(brotliDecompressSync(br.body).toString("utf8")), stable(html));

  const gz = await get("/", { "Accept-Encoding": "gzip" });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.equal(stable(gunzipSync(gz.body).toString("utf8")), stable(html));
  // The cache policy the page set is untouched.
  assert.equal(gz.headers["cache-control"], plain.headers["cache-control"]);
});

test("proxied api JSON is compressed, keeping its Vary and weakening its ETag", async () => {
  const res = await get("/api/site/big", { "Accept-Encoding": "gzip" });
  assert.equal(res.status, 200);
  assert.equal(res.headers["content-encoding"], "gzip");
  assert.equal(res.headers["content-length"], undefined);
  assert.equal(res.headers.vary, "Origin, Accept-Encoding");
  assert.equal(res.headers.etag, "W/\"v1\"");
  assert.equal(gunzipSync(res.body).toString("utf8"), bigJson);
});

test("tiny bodies, HEAD, event streams and clients that did not ask are sent as is", async () => {
  const small = await get("/api/site/small", { "Accept-Encoding": "gzip" });
  assert.equal(small.headers["content-encoding"], undefined);
  assert.equal(small.body.toString(), "{}");

  const head = await get("/api/site/big", { "Accept-Encoding": "gzip" }, "HEAD");
  assert.equal(head.headers["content-encoding"], undefined);

  const events = await get("/api/site/events", { "Accept-Encoding": "gzip, br" });
  assert.equal(events.headers["content-encoding"], undefined);
  assert.match(events.body.toString(), /^data: x+/);

  const identity = await get("/api/site/big");
  assert.equal(identity.headers["content-encoding"], undefined);
  assert.equal(identity.body.toString(), bigJson);
});

test("static text files are compressed; byte ranges are not", async () => {
  const assets = await readdir(fileURLToPath(new URL("../build/client/assets", import.meta.url)));
  const js = assets.find((name) => name.endsWith(".js"));
  assert.ok(js, "a built script exists");
  const plain = await get(`/assets/${js}`);
  const gz = await get(`/assets/${js}`, { "Accept-Encoding": "gzip" });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.equal(gz.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.deepEqual(gunzipSync(gz.body), plain.body);

  const range = await get(`/assets/${js}`, { "Accept-Encoding": "gzip", Range: "bytes=0-99" });
  assert.equal(range.status, 206);
  assert.equal(range.headers["content-encoding"], undefined);
  assert.deepEqual(range.body, plain.body.subarray(0, 100));
});

test("a streamed response reaches the client in parts while it is still being written", async () => {
  let whole!: Promise<string>;
  const firstPart = await new Promise<string>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: web.port, path: "/api/site/stream", headers: { "Accept-Encoding": "gzip" } }, (res) => {
      assert.equal(res.headers["content-encoding"], "gzip");
      const gunzip = createGunzip();
      let text = "";
      whole = new Promise((done, fail) => {
        gunzip.on("end", () => done(text));
        gunzip.on("error", fail);
      });
      gunzip.on("data", (chunk: Buffer) => {
        text += chunk.toString();
        // The upstream has not ended yet: this text came from a flush, not from the end of the body.
        if (text.includes("first part")) resolve(text);
      });
      res.pipe(gunzip);
    });
    req.on("error", reject);
    req.end();
  });
  assert.match(firstPart, /^first part\n/);
  assert.doesNotMatch(firstPart, /second part/);
  releaseStream();
  assert.match(await whole, /first part\nsecond part\n$/);
});
