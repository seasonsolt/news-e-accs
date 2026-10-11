// Cloudflare Access sign-in: only a token signed by the team's key, for this application, unexpired, for
// an allowlisted email opens an admin session; the session ends with the token and follows the allowlist.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import Fastify from "fastify";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { sha256 } from "@aihot/backend/lib/ids";
import { SESSION_COOKIE, sessionPrincipal } from "@aihot/backend/admin/auth";
import { registerAdminAuth } from "../apps/api/src/routes/admin-auth.ts";

const T = tag();
const TEAM = `team-${T}.cloudflareaccess.com`;
const AUD = `aud-${T}`;
const EMAIL = `admin-${T}@example.test`;
const original = { password: config.adminPassword, emails: config.adminEmails, team: config.accessTeamDomain, aud: config.accessAud, dev: config.devAdmin };
const oldSecret = process.env.SESSION_SECRET;
const teamKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
let certFetches = 0;

const app = Fastify({ logger: false });
registerAdminAuth(app);
let base = "";
const realFetch = globalThis.fetch;
// Only the team's certs are answered, locally; no other network destination is allowed.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === base) return realFetch(input, init);
  assert.equal(url.href, `https://${TEAM}/cdn-cgi/access/certs`);
  certFetches++;
  return Response.json({ keys: [{ ...teamKey.publicKey.export({ format: "jwk" }), kid: "team-key", alg: "RS256", use: "sig" }] });
}) as typeof fetch;

function jwt(payload: Record<string, unknown>, key: KeyObject = teamKey.privateKey, kid = "team-key") {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signed = `${part({ alg: "RS256", kid, typ: "JWT" })}.${part(payload)}`;
  return `${signed}.${sign("RSA-SHA256", Buffer.from(signed), key).toString("base64url")}`;
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({ iss: `https://${TEAM}`, aud: [AUD], email: EMAIL, sub: "user", iat: now(), exp: now() + 3600, ...over });

async function access(headers: Record<string, string>, query = "?return=%2Fadmin%2Fsources") {
  return realFetch(`${base}/api/auth/access${query}`, { headers, redirect: "manual" });
}
function sessionToken(response: Response): string | null {
  const match = /aihot_admin=([^;]+)/.exec(response.headers.get("set-cookie") ?? "");
  return match ? decodeURIComponent(match[1]!) : null;
}
async function signIn(token = jwt(claims())) {
  const response = await access({ "cf-access-jwt-assertion": token });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/admin/sources");
  return sessionToken(response)!;
}

before(async () => {
  base = await app.listen({ host: "127.0.0.1", port: 0 });
});
beforeEach(() => {
  config.adminPassword = null;
  config.adminEmails = [EMAIL];
  config.accessTeamDomain = TEAM;
  config.accessAud = AUD;
  config.devAdmin = null;
  process.env.SESSION_SECRET = `test-session-secret-${T}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  Object.assign(config, { adminPassword: original.password, adminEmails: original.emails, accessTeamDomain: original.team, accessAud: original.aud, devAdmin: original.dev });
  if (oldSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = oldSecret;
  await closeDb();
});

test("sign-in starts at Access when it is configured, and the options say so", async () => {
  const login = await realFetch(`${base}/api/auth/login?return=%2Fadmin%2Fruns`, { redirect: "manual" });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get("location"), "/api/auth/access?return=%2Fadmin%2Fruns");
  assert.deepEqual(await (await realFetch(`${base}/api/auth/options`)).json(), { password: false, feishu: false, access: true });
  config.accessAud = null;
  assert.equal((await access({ "cf-access-jwt-assertion": jwt(claims()) })).headers.get("location"), "/admin/login?return=%2Fadmin%2Fsources");
});

test("a valid Access token, from the header or the cookie, opens a session that ends with the token", async () => {
  const exp = now() + 1800;
  const token = await signIn(jwt(claims({ exp })));
  const admin = await sessionPrincipal(`${SESSION_COOKIE}=${token}`);
  assert.equal(admin?.name, EMAIL);
  const [row] = await sql<{ expires_at: Date; auth_method: string; auth_claims: unknown }[]>`SELECT expires_at, auth_method, auth_claims FROM admin_sessions WHERE id_hash=${sha256(token)}`;
  assert.equal(row!.auth_method, "access");
  assert.deepEqual(row!.auth_claims, { team: TEAM, aud: AUD, email: EMAIL });
  assert.ok(Math.abs(row!.expires_at.getTime() - exp * 1000) < 1000);
  const viaCookie = await access({ cookie: `CF_Authorization=${jwt(claims({ email: EMAIL.toUpperCase() }))}` });
  assert.equal(viaCookie.status, 302);
  assert.ok(await sessionPrincipal(`${SESSION_COOKIE}=${sessionToken(viaCookie)}`));
  const unsafe = await access({ "cf-access-jwt-assertion": jwt(claims()) }, "?return=https%3A%2F%2Fevil.example%2F");
  assert.equal(unsafe.headers.get("location"), "/admin");
});

for (const [name, token] of [
  ["missing", null],
  ["malformed", "not.a.jwt"],
  ["signed by another key", () => jwt(claims(), otherKey.privateKey)],
  ["unknown key id", () => jwt(claims(), teamKey.privateKey, "rotated-away")],
  ["for another application", () => jwt(claims({ aud: ["another-app"] }))],
  ["from another team", () => jwt(claims({ iss: "https://other.cloudflareaccess.com" }))],
  ["expired", () => jwt(claims({ exp: now() - 5 }))],
  ["not yet valid", () => jwt(claims({ nbf: now() + 600 }))],
  ["for an email not on the allowlist", () => jwt(claims({ email: `someone-${T}@example.test` }))],
  ["without an email", () => jwt(claims({ email: undefined }))],
] as const) test(`an Access token ${name} is refused without a session`, async () => {
  const value = typeof token === "function" ? token() : token;
  const response = await access(value ? { "cf-access-jwt-assertion": value } : {});
  assert.equal(response.status, 403);
  assert.equal(sessionToken(response), null);
});

test("unknown key ids refetch the team's certs at most once a minute", async () => {
  await signIn();
  const before = certFetches;
  for (let i = 0; i < 3; i++) assert.equal((await access({ "cf-access-jwt-assertion": jwt(claims(), teamKey.privateKey, `unknown-${i}`) })).status, 403);
  assert.ok(certFetches - before <= 1);
});

for (const change of ["allowlist", "team", "audience", "Access removal"]) test(`an Access session is revoked by a change of ${change}`, async () => {
  const token = await signIn();
  assert.ok(await sessionPrincipal(`${SESSION_COOKIE}=${token}`));
  if (change === "allowlist") config.adminEmails = [];
  if (change === "team") config.accessTeamDomain = `other-${TEAM}`;
  if (change === "audience") config.accessAud = `${AUD}-replaced`;
  if (change === "Access removal") config.accessTeamDomain = null;
  assert.equal(await sessionPrincipal(`${SESSION_COOKIE}=${token}`), null);
  assert.equal((await sql`SELECT 1 FROM admin_sessions WHERE id_hash=${sha256(token)}`).length, 0);
});

test("signing out of the admin also signs out of Access", async () => {
  const token = await signIn();
  const response = await realFetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie: `${SESSION_COOKIE}=${token}` }, redirect: "manual" });
  assert.equal(response.headers.get("location"), "/cdn-cgi/access/logout");
  assert.equal(await sessionPrincipal(`${SESSION_COOKIE}=${token}`), null);
});
