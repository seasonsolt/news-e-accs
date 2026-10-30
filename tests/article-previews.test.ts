// An original page's share picture leads its report's card and page: a picture other articles of the
// same source also declare is the site's default and none of them shows it; small pictures, pages
// without one and X posts show none.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import sharp from "sharp";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { findPreviews } from "@aihot/backend/media/previews";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { ITEM_COLUMNS, ITEM_FROM, toFeedItemSummary, type ItemRow } from "@aihot/backend/publication/items";

const savedPrivate = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;

after(async () => {
  config.allowPrivateNetworkFetch = savedPrivate;
  await stopBoss();
  await closeDb();
});

const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#406080" } }).png().toBuffer();

test("a report shows its page's own share picture, never a site default, a small one or one for an X post", async () => {
  const pictures: Record<string, Buffer> = { "/wide.png": await png(1600, 900), "/logo.png": await png(1200, 630), "/small.png": await png(200, 100) };
  const pages: Record<string, string | null> = { "/own": "/wide.png", "/default-1": "/logo.png", "/default-2": "/logo.png", "/small": "/small.png", "/none": null };
  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    if (pictures[path]) {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(pictures[path]);
    } else if (path in pages) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<html><head>${pages[path] ? `<meta property="og:image" content="${pages[path]}">` : ""}</head><body>Report</body></html>`);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const source = `previews-${tag()}`;
    await sql`INSERT INTO sources (id,name,kind,tier,participation_mode,next_fetch_at) VALUES (${source},'Previews','rss','T1','editorial','2100-01-01')`;
    const at = new Date(Date.now() - 60_000);
    const add = async (name: string, channel: "news" | "x", selected = false) => {
      const id = `${source}-${name}`;
      const url = `${origin}/${name}`;
      await sql`INSERT INTO articles(id,source_id,identity_key,url,title,discovered_at,timeline_at) VALUES (${id},${source},${id},${url},${name},${at},${at})`;
      await sql`INSERT INTO publications(article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,body_mode,eligible,channel,selected,visible_after)
        VALUES (${id},${source},${name},'Summary',${url},${at},${at},${at},'summary',true,${channel},${selected},${selected ? at : null})`;
      return id;
    };
    const own = await add("own", "news", true);
    const defaults = [await add("default-1", "news"), await add("default-2", "news")];
    const small = await add("small", "news");
    const none = await add("none", "news");
    const post = await add("own-post", "x");

    await findPreviews(100);
    const stored = new Map((await sql<{ id: string; preview: Record<string, unknown> | null }[]>`
      SELECT id, preview FROM articles WHERE source_id = ${source}`).map((r) => [r.id, r.preview]));
    assert.deepEqual([stored.get(own)?.url, stored.get(own)?.width, stored.get(own)?.height], [`${origin}/wide.png`, 1600, 900]);
    for (const id of defaults) assert.equal(stored.get(id)?.shared, true, "both articles declaring one picture are marked, the first too");
    assert.equal(stored.get(small)?.url, null);
    assert.equal(stored.get(none)?.url, null);
    assert.equal(stored.get(post), null, "an X post shows its own media");

    const cards = new Map((await sql<ItemRow[]>`SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE p.source_id = ${source}`).map((r) => [r.id, toFeedItemSummary(r)]));
    assert.match(cards.get(own)!.cover!.url, /\/api\/img-proxy\?u=[^&]*wide\.png&mode=card&/);
    assert.match(cards.get(own)!.cover!.srcSet!, / 720w$/);
    for (const id of [...defaults, small, none, post]) assert.equal(cards.get(id)!.cover, null, id);

    const page = await loadItemDetail(own);
    assert.equal(page.kind, "found");
    if (page.kind === "found") assert.match(page.item.cover!.url, /wide\.png&mode=full&/, "a page without a body shows the picture at reading width");
    const [prepared] = await sql`SELECT id FROM pgboss.job WHERE name = 'media.prepare' AND data->>'articleId' = ${own}`;
    assert.ok(prepared, "a selected item's renditions are prepared again with its picture");

    await findPreviews(100);
    assert.equal((await sql`SELECT count(*)::int AS n FROM articles WHERE source_id = ${source} AND preview IS NOT NULL`)[0]!.n, 5, "each article is looked up once");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
