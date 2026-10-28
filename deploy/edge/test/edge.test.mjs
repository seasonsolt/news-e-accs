// The Worker against a stub origin and an in-memory Cache API: every path reaches the news site with the
// edge secret, anonymous public responses are kept and restored with the origin's Cache-Control, and a
// session, a private path or an uncacheable response never enters the shared cache.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import worker from "../src/index.mjs";

const env = { NEWS_ORIGIN: "https://news.example", EDGE_SECRET: "s3cret" };
let seen;
let store;

beforeEach(() => {
  seen = [];
  store = new Map();
  globalThis.caches = {
    default: {
      match: async (req) => store.get(req.url)?.clone(),
      put: async (req, res) => void store.set(req.url, res),
    },
  };
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    const path = new URL(url).pathname;
    const cacheControl = path.startsWith("/private") ? "private, no-store" : "public, max-age=0, s-maxage=300";
    return new Response(`body of ${path}`, { headers: { "cache-control": cacheControl } });
  };
});

async function get(path, headers = {}, method = "GET") {
  const waits = [];
  const res = await worker.fetch(new Request(`https://e-acc.ai${path}`, { method, headers }), env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return res;
}

test("every path goes to the news site with the secret, the visitor's address and no redirect following", async () => {
  for (const path of ["/pricing?x=1", "/timeline", "/api/v1/items", "/sitemap.xml", "/zh/pricing"]) {
    await get(path, { "cf-connecting-ip": "203.0.113.9" });
    const last = seen.at(-1);
    assert.equal(last.url, `https://news.example${path}`);
    assert.equal(last.init.headers.get("x-eacc-edge"), "s3cret");
    assert.equal(last.init.headers.get("x-eacc-client-ip"), "203.0.113.9");
    assert.equal(last.init.headers.get("x-forwarded-host"), "e-acc.ai");
    assert.equal(last.init.redirect, "manual");
  }
});

test("the visitor's country goes to the news site for its reader counts", async () => {
  const request = new Request("https://e-acc.ai/api/site/analytics", { method: "POST", body: "{}" });
  Object.defineProperty(request, "cf", { value: { country: "JP" } });
  await worker.fetch(request, env, { waitUntil: () => {} });
  assert.equal(seen.at(-1).init.headers.get("x-eacc-country"), "JP");
  await get("/");
  assert.equal(seen.at(-1).init.headers.get("x-eacc-country"), "", "a request without Cloudflare's details names none");
});

test("a public page is cached once and served from the edge with the origin's Cache-Control", async () => {
  const miss = await get("/pricing");
  assert.equal(miss.headers.get("x-eacc-edge-cache"), "MISS");
  const hit = await get("/pricing");
  assert.equal(hit.headers.get("x-eacc-edge-cache"), "HIT");
  assert.equal(hit.headers.get("cache-control"), "public, max-age=0, s-maxage=300");
  assert.equal(hit.headers.get("x-eacc-origin-cache-control"), null);
  assert.equal(await hit.text(), "body of /pricing");
  assert.equal(seen.length, 1);
});

test("sessions, private paths, HEAD misses and uncacheable responses stay out of the cache", async () => {
  await get("/pricing", { cookie: "theme=dark; aihot_admin=1" });
  await get("/admin/sources");
  await get("/private-page");
  const head = await get("/leaderboard", {}, "HEAD");
  assert.equal(await head.text(), "");
  assert.equal(store.size, 0);
});

test("Router data shares one entry whatever its _routes parameter", async () => {
  await get("/pricing.data?_routes=a,b&lang=en");
  const hit = await get("/pricing.data?lang=en&_routes=c");
  assert.equal(hit.headers.get("x-eacc-edge-cache"), "HIT");
  assert.deepEqual([...store.keys()], ["https://e-acc.ai/pricing.data?lang=en"]);
});

test("a scene file is read from R2's scenes/ prefix, kept for good, and never reaches the news site", async () => {
  const reads = [];
  const bucket = {
    get: async (key) => {
      reads.push(key);
      return /scenes\/workshop\/(?:wood-color\.0123456789\.webp|boulder\.0123456789\.glb|dawn\.0123456789\.hdr)$/.test(key)
        ? { body: "webp bytes", size: 10, httpEtag: '"e1"' }
        : null;
    },
  };
  const scenes = { ...env, MEDIA: bucket };
  const fetchScene = async (path, headers = {}, method = "GET") => {
    const waits = [];
    const res = await worker.fetch(new Request(`https://e-acc.ai${path}`, { method, headers }), scenes, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    return res;
  };

  const miss = await fetchScene("/media/scenes/workshop/wood-color.0123456789.webp");
  assert.equal(miss.status, 200);
  assert.equal(miss.headers.get("content-type"), "image/webp");
  assert.equal(miss.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(miss.headers.get("x-eacc-edge-cache"), "MISS");
  assert.equal(await miss.text(), "webp bytes");
  const hit = await fetchScene("/media/scenes/workshop/wood-color.0123456789.webp");
  assert.equal(hit.headers.get("x-eacc-edge-cache"), "HIT");
  assert.equal(await hit.text(), "webp bytes");
  const unchanged = await fetchScene("/media/scenes/workshop/wood-color.0123456789.webp", { "if-none-match": '"e1"' });
  assert.equal(unchanged.status, 304);
  assert.deepEqual(reads, ["scenes/workshop/wood-color.0123456789.webp"]);

  for (const [name, type] of [["boulder.0123456789.glb", "model/gltf-binary"], ["dawn.0123456789.hdr", "application/octet-stream"]]) {
    const binary = await fetchScene(`/media/scenes/workshop/${name}`);
    assert.equal(binary.status, 200);
    assert.equal(binary.headers.get("content-type"), type);
    assert.equal(binary.headers.get("cache-control"), "public, max-age=31536000, immutable");
    const head = await fetchScene(`/media/scenes/workshop/${name}`, {}, "HEAD");
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
  }

  const missing = await fetchScene("/media/scenes/workshop/stone-color.0123456789.webp");
  assert.equal(missing.status, 404);
  assert.equal(seen.length, 0);

  // Anything else under /media, including the bucket's private prefixes, goes to the news site as before.
  for (const path of ["/media/wallpapers/a.webp", "/media/scenes/../wallpapers/a.0123456789.webp", "/media/scenes/workshop/a.webp", "/media/scenes/Workshop/a.0123456789.webp"]) {
    await fetchScene(path);
  }
  assert.equal(reads.length, 4);
  assert.equal(seen.length, 4);
});
