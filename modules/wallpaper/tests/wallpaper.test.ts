import { stub } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import Fastify from "fastify";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { config } from "@aihot/backend/config";
import { sql, closeDb } from "@aihot/backend/db";
import { beijingDate, addDays } from "@aihot/contracts/time";
import module from "../server.ts";
import { installModules } from "@aihot/backend/modules";
import { registerMcp } from "../../../apps/api/src/routes/mcp.ts";
const emails: any[] = [];
const mail = await stub((_hit, req) => { assert.equal(req.url, "/emails"); emails.push(JSON.parse(req.body)); return { id: `email-${emails.length}` }; });
process.env.RESEND_BASE_URL = mail.url;
process.env.RESEND_API_KEY = "re_test_key";
process.env.RESEND_SEGMENT_ID = "seg-test";
process.env.RESEND_SEGMENT_ID_EN = "seg-en-test";
config.newsletterEnabled = true;
config.allowPrivateNetworkFetch = true;
const app = Fastify(); module.http!(app);
const today = beijingDate(Date.now());
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);
let ip = 0;
const claim = (payload: object) => app.inject({ method: "POST", url: "/api/site/wallpaper/claim", headers: { "x-real-ip": `198.51.100.${++ip}` }, payload });
async function subscriber(status = "confirmed") {
  const token = randomBytes(32).toString("base64url");
  const email = `${token.toLowerCase()}@example.test`;
  const [row] = await sql`INSERT INTO newsletter_subscribers (email, token, status, language) VALUES (${email}, ${token}, ${status}, 'en') RETURNING id`;
  return { id: row!.id, token, email };
}
async function image(width: number, height: number, format: "jpeg" | "webp") {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#c0a080" } }).toFormat(format).toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
}
const pictures = { desktop: await image(3840, 2160, "jpeg"), phone: await image(2160, 3840, "jpeg"), preview: await image(1600, 900, "webp") };
const upload = (day: string, extra = {}) => app.inject({ method: "POST", url: "/api/admin/wallpapers", headers: { "x-csrf-token": "dev" }, payload: { day, titleZh: "测试壁纸", titleEn: "Test wallpaper", ...pictures, ...extra } });
after(async () => { await app.close(); await mail.close(); await closeDb(); });

test("upload validates images, overwrites a day, protects published work and requires admin", async () => {
  config.devAdmin = null;
  assert.equal((await upload(today)).statusCode, 401);
  config.devAdmin = { displayName: "wallpaper-test" };
  assert.equal((await upload(today, { desktop: pictures.phone })).statusCode, 400);
  assert.equal((await upload(today, { preview: pictures.desktop })).statusCode, 400);
  for (const day of [yesterday, today, tomorrow]) assert.equal((await upload(day)).statusCode, 200);
  assert.equal((await upload(today, { titleEn: "Updated" })).statusCode, 200);
  assert.equal((await sql`SELECT count(*)::int AS n FROM wallpapers WHERE day = ${today}`)[0]!.n, 1);
  assert.equal((await app.inject({ method: "DELETE", url: `/api/admin/wallpapers/${today}`, headers: { "x-csrf-token": "dev" } })).statusCode, 400);
});

test("token claim rotates without replenishing and rejects pending/unsubscribed readers", async () => {
  const s = await subscriber();
  const first = (await claim({ token: s.token })).json();
  assert.equal(first.credits, 100);
  await sql`UPDATE wallpaper_keys SET credits = 90 WHERE subscriber_id = ${s.id}`;
  const second = (await claim({ token: s.token })).json();
  assert.equal(second.credits, 90); assert.notEqual(first.key, second.key);
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${first.key}`)).statusCode, 401);
  const stored = (await sql`SELECT key_hash FROM wallpaper_keys WHERE subscriber_id = ${s.id}`)[0]!.key_hash;
  assert.equal(stored.length, 64); assert.notEqual(stored, second.key);
  const pending = await subscriber("pending");
  assert.equal((await claim({ token: pending.token })).statusCode, 404);
  await sql`UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE id = ${s.id}`;
  assert.equal((await claim({ token: s.token })).statusCode, 404);
  const denied = await app.inject(`/api/site/wallpaper/me?key=${second.key}`);
  assert.equal(denied.statusCode, 403); assert.equal(denied.headers["cache-control"], "private, no-store");
});

test("email claim sends links or confirmation privately and enforces cooldown", async () => {
  const s = await subscriber();
  const { key } = (await claim({ token: s.token })).json();
  const start = emails.length;
  const known = await claim({ email: s.email, lang: "en" });
  const unknown = await claim({ email: "new-wallpaper@example.test", lang: "zh" });
  assert.equal(known.statusCode, 202); assert.equal(unknown.statusCode, 202);
  assert.deepEqual(known.json(), unknown.json()); assert.equal(emails.length - start, 2);
  assert.match(emails[start].text, new RegExp(`/products/wallpaper#token=${s.token}`));
  assert.doesNotMatch(emails[start].text, /#key=/);
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).statusCode, 200, "asking by email must not retire the reader's key");
  assert.match(emails[start + 1].text, /\/zh\/subscribe\?token=/);
  assert.equal((await sql`SELECT signup_source FROM newsletter_subscribers WHERE email = 'new-wallpaper@example.test'`)[0]!.signup_source, "wallpaper");
  await Promise.all([claim({ email: s.email, lang: "en" }), claim({ email: s.email, lang: "en" })]);
  await claim({ email: "new-wallpaper@example.test", lang: "zh" });
  assert.equal(emails.length - start, 2);
});

test("downloads charge once per day under concurrency, preserve paid access at zero, and gate private files", async () => {
  const s = await subscriber();
  const { key } = (await claim({ token: s.token })).json();
  const get = (day: string, kind = "desktop", k = key) => app.inject(`/products/wallpaper/${day}/${kind}.jpg?key=${k}`);
  const parallel = await Promise.all([get(today), get(today, "phone")]);
  for (const res of parallel) { assert.equal(res.statusCode, 200); assert.equal(res.headers["cache-control"], "private, no-store"); }
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 90);
  assert.equal((await get("today")).headers["content-disposition"], `inline; filename="e-acc-wallpaper-${today}-desktop.jpg"`);
  assert.equal((await get(yesterday)).statusCode, 200);
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 80);
  for (let days = 2; days < 10; days++) {
    const day = addDays(today, -days);
    assert.equal((await upload(day)).statusCode, 200);
    assert.equal((await get(day)).statusCode, 200);
  }
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 0);
  const earlier = addDays(today, -10); await upload(earlier);
  assert.equal((await get(earlier)).statusCode, 402);
  assert.equal((await get(today)).statusCode, 200);
  await sql`UPDATE wallpaper_keys SET credits = 5 WHERE subscriber_id = ${s.id}`;
  assert.equal((await get(earlier)).statusCode, 402);
  assert.equal((await get(today)).statusCode, 200);
  assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 5);
  assert.equal((await get(tomorrow)).statusCode, 404);
  assert.equal((await get("2026-02-31")).statusCode, 404);
  const invalid = await get(today, "desktop", "invalid");
  assert.equal(invalid.statusCode, 401); assert.equal(invalid.headers["cache-control"], "private, no-store");
  await sql`UPDATE newsletter_subscribers SET unsubscribed_at = now() WHERE id = ${s.id}`;
  assert.equal((await get(today)).statusCode, 403);
});

test("public list and immutable previews expose no subscriber data or future dates", async () => {
  const res = await app.inject("/api/site/wallpapers?lang=en");
  assert.equal(res.statusCode, 200); assert.ok(res.headers.etag);
  assert.ok(res.json().every((w: any) => w.day <= today && Object.keys(w).sort().join() === "day,id,preview,title"));
  const preview = await app.inject(res.json()[0].preview);
  assert.equal(preview.statusCode, 200); assert.equal(preview.headers["cache-control"], "public, max-age=31536000, s-maxage=31536000, immutable");
  assert.equal((await app.inject("/products/wallpaper/preview/desktop-test.jpg")).statusCode, 404);
});

test("with an object store, 4K files go to the bucket and charged downloads redirect to a short signed link", async () => {
  const puts: { url: string; authorization: string }[] = [];
  const bucket = await stub((_hit, req) => { assert.equal(req.method, "PUT"); puts.push({ url: req.url, authorization: String(req.headers.authorization) }); return {}; });
  Object.assign(process.env, { OBJECT_STORE_ENDPOINT: bucket.url, OBJECT_STORE_BUCKET: "e-acc", OBJECT_STORE_ACCESS_KEY_ID: "test-access", OBJECT_STORE_SECRET_ACCESS_KEY: "test-secret" });
  try {
    const day = addDays(today, -20);
    assert.equal((await upload(day)).statusCode, 200);
    const [row] = await sql`SELECT desktop_file, phone_file, preview_file FROM wallpapers WHERE day = ${day}`;
    assert.deepEqual(puts.map((p) => p.url).sort(), [`/e-acc/wallpapers/${row!.desktop_file}`, `/e-acc/wallpapers/${row!.phone_file}`].sort());
    assert.ok(puts.every((p) => p.authorization.startsWith("AWS4-HMAC-SHA256 Credential=test-access/") && p.authorization.includes("/auto/s3/aws4_request")));
    assert.equal((await app.inject(`/products/wallpaper/preview/${row!.preview_file}`)).statusCode, 200, "previews stay on the server");
    const s = await subscriber();
    const { key } = (await claim({ token: s.token })).json();
    const res = await app.inject(`/products/wallpaper/${day}/phone.jpg?key=${key}`);
    assert.equal(res.statusCode, 302); assert.equal(res.headers["cache-control"], "private, no-store");
    const location = new URL(String(res.headers.location));
    assert.equal(`${location.origin}${location.pathname}`, `${bucket.url}/e-acc/wallpapers/${row!.phone_file}`);
    assert.equal(location.searchParams.get("X-Amz-Expires"), "300"); assert.match(location.searchParams.get("X-Amz-Signature")!, /^[a-f0-9]{64}$/);
    assert.equal(location.searchParams.get("response-content-disposition"), `inline; filename="e-acc-wallpaper-${day}-phone.jpg"`);
    assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 90);
    assert.equal((await app.inject(`/products/wallpaper/${day}/desktop.jpg?key=${key}`)).statusCode, 302);
    assert.equal((await app.inject(`/api/site/wallpaper/me?key=${key}`)).json().credits, 90);
  } finally {
    for (const k of ["OBJECT_STORE_ENDPOINT", "OBJECT_STORE_BUCKET", "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY"]) delete process.env[k];
    await bucket.close();
  }
});

test("MCP registers wallpaper_today and its answer contains only public metadata", async () => {
  installModules([module]);
  const mcp = Fastify(); registerMcp(mcp);
  try {
    const res = await mcp.inject({ method: "POST", url: "/api/mcp", headers: { host: new URL(config.siteUrl).host, accept: "application/json, text/event-stream", "content-type": "application/json" }, payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} } });
    assert.match(res.body, /wallpaper_today/);
    const result = await module.agent!.abilities![0]!.mcp.run({});
    assert.doesNotMatch(result.text, /key_hash|subscriber|email/);
  } finally { await mcp.close(); installModules([]); }
});
