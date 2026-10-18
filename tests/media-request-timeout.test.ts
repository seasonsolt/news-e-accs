import "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss, QUEUES } from "@aihot/backend/jobs/queue";
import { mediaRequestStats } from "@aihot/backend/media/request";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();
after(async () => { await app.close(); await stopBoss(); await closeDb(); });

test("a worker outage ends the cold wait without caching a failure or rendering in API", async () => {
  await getBoss();
  const started = Date.now();
  const result = await app.inject({ method: "GET", url: "/og/pages/all.png" });
  assert.ok(Date.now() - started >= 30_000, "the real wait budget must elapse");
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.headers["retry-after"], "5");
  assert.equal(mediaRequestStats().pending, 0);
  const [job] = await sql`SELECT state FROM pgboss.job WHERE name = ${QUEUES.renderMedia}`;
  assert.equal(job!.state, "created", "no fallback API renderer consumed the queued work");
});
