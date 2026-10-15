// Cloudflare Web Analytics: the production beacon is one deferred script before </body>, skipped for
// admin documents and for development or a local SITE_URL. Hydration must adopt that tag, not load it twice.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, type Browser } from "@playwright/test";
import { SITE } from "@aihot/site";
import { isAdminPath, WEB_ANALYTICS_SRC, webAnalyticsAttribute } from "../app/lib/web-analytics.ts";
import { webAnalyticsToken } from "../app/lib/web-analytics.server.ts";
import { startWebServer } from "./web-server.ts";

const TOKEN = "test-token-not-real";

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the beacon token follows production, the environment, and the site default", () => {
  assert.equal(SITE.webAnalyticsToken, "9aa8607e94a5423ab6cf96556830c0e2");
  assert.equal(webAnalyticsAttribute("abc"), "{\"token\":\"abc\"}");
  assert.equal(isAdminPath("/admin") && isAdminPath("/admin/login") && !isAdminPath("/privacy") && !isAdminPath("/administrator"), true);

  const production = { NODE_ENV: "production", SITE_URL: "https://e-acc.ai" };
  withEnv({ ...production, CF_WEB_ANALYTICS_TOKEN: undefined }, () => assert.equal(webAnalyticsToken(), SITE.webAnalyticsToken));
  withEnv({ ...production, CF_WEB_ANALYTICS_TOKEN: `  ${TOKEN}  ` }, () => assert.equal(webAnalyticsToken(), TOKEN));
  withEnv({ ...production, CF_WEB_ANALYTICS_TOKEN: " " }, () => assert.equal(webAnalyticsToken(), null));
  withEnv({ NODE_ENV: "development", SITE_URL: "https://e-acc.ai", CF_WEB_ANALYTICS_TOKEN: TOKEN }, () => assert.equal(webAnalyticsToken(), null));
  withEnv({ NODE_ENV: "test", SITE_URL: "https://e-acc.ai", CF_WEB_ANALYTICS_TOKEN: TOKEN }, () => assert.equal(webAnalyticsToken(), null));
  for (const siteUrl of ["http://127.0.0.1:3000", "http://localhost:3000/", "http://[::1]:3000", "not a url"]) {
    withEnv({ NODE_ENV: "production", SITE_URL: siteUrl, CF_WEB_ANALYTICS_TOKEN: TOKEN }, () => assert.equal(webAnalyticsToken(), null, siteUrl));
  }
  withEnv({ NODE_ENV: "production", SITE_URL: undefined, CF_WEB_ANALYTICS_TOKEN: undefined }, () => assert.equal(webAnalyticsToken(), SITE.webAnalyticsToken));
});

function api() {
  return createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/site/meta") return res.end(JSON.stringify({ changelogVersion: null }));
    res.writeHead(404);
    res.end("{}");
  });
}

function beaconTags(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]).filter((tag) => tag.includes(WEB_ANALYTICS_SRC));
}

test("a public production page carries one deferred beacon before </body>, and admin does not", async () => {
  const web = await startWebServer(api(), { NODE_ENV: "production", SITE_URL: "https://e-acc.ai", CF_WEB_ANALYTICS_TOKEN: TOKEN });
  try {
    const privacy = await fetch(web.origin + "/privacy");
    assert.equal(privacy.status, 200);
    const html = await privacy.text();
    const tags = beaconTags(html);
    assert.equal(tags.length, 1);
    assert.match(tags[0]!, /\bdefer\b/);
    assert.doesNotMatch(tags[0]!, /\basync\b/);
    assert.ok(tags[0]!.replaceAll("&quot;", "\"").includes(webAnalyticsAttribute(TOKEN)));
    const end = html.indexOf("</script>", html.indexOf(tags[0]!));
    // The router's loader stream is written after the shell, immediately before </body>.
    assert.match(html.slice(end + "</script>".length), /^\s*(?:<\/body>|<!--\$--><script>window\.__reactRouterContext\.streamController)/);
    assert.equal(html.split(WEB_ANALYTICS_SRC).length - 1, 1);
    assert.match(html, /Cloudflare Web Analytics（无 Cookie）/);

    const chinese = await (await fetch(web.origin + "/zh/privacy")).text();
    assert.equal(beaconTags(chinese).length, 1);

    const admin = await (await fetch(web.origin + "/admin/login")).text();
    assert.equal(admin.includes(WEB_ANALYTICS_SRC), false);
    assert.match(admin, /登录/);
  } finally {
    await web.stop();
  }
});

test("development and a local production address do not emit the beacon", async () => {
  const web = await startWebServer(api(), { NODE_ENV: "production", CF_WEB_ANALYTICS_TOKEN: TOKEN });
  try {
    const html = await (await fetch(web.origin + "/privacy")).text();
    assert.equal(html.includes(WEB_ANALYTICS_SRC), false);
    assert.equal(html.includes(TOKEN), false);
  } finally {
    await web.stop();
  }
  const dev = await startWebServer(api(), { NODE_ENV: "development", SITE_URL: "https://e-acc.ai", CF_WEB_ANALYTICS_TOKEN: TOKEN });
  try {
    const html = await (await fetch(dev.origin + "/privacy")).text();
    assert.equal(html.includes(WEB_ANALYTICS_SRC), false);
  } finally {
    await dev.stop();
  }
});

test("hydration keeps a single beacon script", { timeout: 60_000 }, async () => {
  const web = await startWebServer(api(), { NODE_ENV: "production", SITE_URL: "https://e-acc.ai", CF_WEB_ANALYTICS_TOKEN: TOKEN });
  let browser: Browser | null = null;
  const problems: string[] = [];
  try {
    browser = await chromium.launch({ channel: "chromium" });
    const page = await browser.newPage();
    let scriptRequests = 0;
    await page.route("https://static.cloudflareinsights.com/**", (route) => {
      scriptRequests += 1;
      return route.fulfill({ status: 200, contentType: "text/javascript", body: "window.__beaconLoads=(window.__beaconLoads||0)+1" });
    });
    await page.route("https://cloudflareinsights.com/**", (route) => route.abort());
    page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
    page.on("pageerror", (error) => problems.push(String(error)));
    await page.goto(web.origin + "/privacy", { waitUntil: "load" });
    await page.waitForFunction(() => window.__beaconLoads === 1);
    assert.equal(scriptRequests, 1);
    assert.equal(await page.locator(`script[src="${WEB_ANALYTICS_SRC}"]`).count(), 1);

    await page.locator('a[href="/terms"]').first().click();
    await page.waitForURL("**/terms");
    assert.equal(scriptRequests, 1, "client navigation must not insert the beacon again");
    assert.equal(await page.evaluate(() => window.__beaconLoads), 1);
    assert.equal(await page.locator(`script[src="${WEB_ANALYTICS_SRC}"]`).count(), 1);

    await page.goto(web.origin + "/admin/login", { waitUntil: "load" });
    assert.equal(await page.locator(`script[src="${WEB_ANALYTICS_SRC}"]`).count(), 0);
    assert.deepEqual(problems.filter((line) => /hydration|Minified React error #(?:418|419|422|423|425)/i.test(line)), []);
  } finally {
    await browser?.close();
    await web.stop();
  }
});

declare global {
  interface Window { __beaconLoads?: number }
}
