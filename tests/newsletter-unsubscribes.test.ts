// Unsubscribes happen in Resend, through an issue's link; the worker reads its contacts back, page by
// page, so subscriber counts leave those readers out until they confirm or resubscribe. Resend is a local stub.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { newsletterOverview } from "@aihot/backend/admin/newsletter";
import { syncUnsubscribes } from "@aihot/backend/newsletter/unsubscribes";

const T = tag();
const [stays, leaves, returns, pending] = ["stays", "leaves", "returns", "pending"].map((who) => `${who}.${T}@example.org`) as [string, string, string, string];
// Resend answers two pages; "leaves" is on the second, written in capitals as a reader may have typed it.
const pages: Record<string, unknown> = {
  "": { object: "list", has_more: true, data: [
    { id: "c1", email: stays, unsubscribed: false },
    { id: "c2", email: returns, unsubscribed: false },
  ] },
  c2: { object: "list", has_more: false, data: [
    { id: "c3", email: leaves.toUpperCase(), unsubscribed: true },
    { id: "c4", email: pending, unsubscribed: true },
  ] },
};
const resend = await stub((_n, req) => {
  const url = new URL(req.url, "http://stub");
  if (req.method !== "GET" || url.pathname !== "/contacts") return new Reply(404, { name: "not_found" });
  assert.equal(url.searchParams.get("limit"), "100");
  return pages[url.searchParams.get("after") ?? ""] ?? new Reply(404, { name: "not_found" });
});
process.env.RESEND_BASE_URL = resend.url;
process.env.RESEND_API_KEY = "re_test_key";
config.allowPrivateNetworkFetch = true;

after(async () => {
  config.newsletterEnabled = false;
  await sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`%.${T}@example.org`}`;
  await resend.close();
  await closeDb();
});

test("a reader who unsubscribed in Resend leaves the counts, and one who resubscribed comes back", async () => {
  await sql`INSERT INTO newsletter_subscribers (email, status, token, confirmed_at, unsubscribed_at) VALUES
    (${stays}, 'confirmed', ${`a${T}`}, now() - interval '20 days', NULL),
    (${leaves}, 'confirmed', ${`b${T}`}, now() - interval '20 days', NULL),
    (${returns}, 'confirmed', ${`c${T}`}, now() - interval '20 days', now() - interval '3 days'),
    (${pending}, 'pending', ${`d${T}`}, NULL, NULL)`;

  assert.deepEqual(await syncUnsubscribes(), { status: "disabled" }, "nothing is read while the newsletter is off");
  config.newsletterEnabled = true;
  assert.deepEqual(await syncUnsubscribes(), { status: "synced", contacts: 4, unsubscribed: 1, resubscribed: 1 });

  const rows = await sql<{ email: string; unsubscribed: boolean }[]>`
    SELECT email, unsubscribed_at IS NOT NULL AS unsubscribed FROM newsletter_subscribers WHERE email LIKE ${`%.${T}@example.org`} ORDER BY email`;
  assert.deepEqual(rows.map((r) => [r.email, r.unsubscribed]), [[leaves, true], [pending, false], [returns, false], [stays, false]],
    "a pending address is not marked: it never became a subscriber");
  // Other test files add subscribers at the same time, so the admin's totals are not compared here.
  const listed = (await newsletterOverview()).rows.filter((r) => r.email.endsWith(`.${T}@example.org`));
  assert.deepEqual(listed.filter((r) => r.unsubscribed_at).map((r) => r.email), [leaves], "the admin list shows who left");

  // A second reading changes nothing: the first time an unsubscribe was seen is kept.
  const [first] = await sql<{ at: Date }[]>`SELECT unsubscribed_at AS at FROM newsletter_subscribers WHERE email = ${leaves}`;
  assert.deepEqual(await syncUnsubscribes(), { status: "synced", contacts: 4, unsubscribed: 0, resubscribed: 0 });
  const [again] = await sql<{ at: Date }[]>`SELECT unsubscribed_at AS at FROM newsletter_subscribers WHERE email = ${leaves}`;
  assert.equal(again!.at.getTime(), first!.at.getTime());
});
