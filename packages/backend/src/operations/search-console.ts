// Search Console's weekly reading (docs/plans/phase-two.md 9.1): clicks and impressions for the last full
// week, and how many of the discovery URLs Google has indexed, by section. Read with a service account the
// property lists as a user; nothing runs unless SEARCH_CONSOLE_ENABLED (apps/worker/src/schedules.ts).
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { siteUrl } from "../publication/links.ts";
import { loadDiscoveryEntries } from "../publication/sitemap.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
// URL Inspection allows 2,000 calls a day and 600 a minute for a property. A call takes a few seconds, so
// one at a time 1,300 URLs outlast both the hour an access token lives and the scheduled job's hour.
const MAX_INSPECTIONS = 1_800;
const INSPECTION_LANES = 5;
const INSPECTION_GAP_MS = 120;
// Access tokens live an hour; a new one is signed well before that.
const TOKEN_RENEW_MS = 45 * 60_000;

// reasons: Google's coverage state for each inspected URL that is not indexed ("Crawled - currently not indexed",
// "Discovered - currently not indexed", ...), counted; weeks read before it was kept have none.
export interface SectionReading { clicks: number; impressions: number; inspected: number; indexed: number; reasons?: Record<string, number> }

/** The address's first part, the Chinese edition counted with the English page: "/zh/story/x" is "story". */
export function pageSection(path: string): string {
  return path.replace(/^\/zh(?=\/|$)/, "").split("/").find(Boolean) ?? "home";
}

/** Monday to Sunday of the last full week before `now` (Beijing dates; Search Console's days are Pacific). */
export function lastFullWeek(now: Date): { start: string; end: string } {
  const today = beijingDate(now);
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  return { start: addDays(monday, -7), end: addDays(monday, -1) };
}

async function accessToken(key: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(30_000),
  });
  // Google's error text can repeat the assertion; the status is enough to diagnose.
  if (!res.ok) throw new Error(`Search Console token: HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function readSearchConsoleWeek(now = new Date()) {
  const property = config.searchConsoleProperty;
  const keyFile = credential("integrations", "SEARCH_CONSOLE_KEY_FILE");
  if (!config.searchConsoleEnabled || !property || !keyFile) return { status: "disabled" as const };
  const key = JSON.parse(readFileSync(keyFile, "utf8")) as { client_email: string; private_key: string };
  let token = { value: accessToken(key), at: Date.now() };
  const google = async <T>(url: string, body: object, what: string): Promise<T> => {
    if (Date.now() - token.at > TOKEN_RENEW_MS) token = { value: accessToken(key), at: Date.now() };
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await token.value}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw Object.assign(new Error(`Search Console ${what}: HTTP ${res.status}`), { status: res.status });
    return (await res.json()) as T;
  };

  const week = lastFullWeek(now);
  const sections = new Map<string, SectionReading>();
  const section = (name: string) => sections.get(name) ?? sections.set(name, { clicks: 0, impressions: 0, inspected: 0, indexed: 0, reasons: {} }).get(name)!;
  const query = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  type Rows = { rows?: Array<{ keys?: string[]; clicks: number; impressions: number }> };
  const [total] = (await google<Rows>(query, { startDate: week.start, endDate: week.end }, "totals")).rows ?? [];
  for (const row of (await google<Rows>(query, { startDate: week.start, endDate: week.end, dimensions: ["page"], rowLimit: 25_000 }, "pages")).rows ?? []) {
    const s = section(pageSection(new URL(row.keys![0]!).pathname));
    s.clicks += row.clicks;
    s.impressions += row.impressions;
  }

  // The discovery URLs are what the site asks Google to index; a quota refusal ends the count where it is.
  const urls = (await loadDiscoveryEntries(now)).map((e) => e.loc).slice(0, MAX_INSPECTIONS);
  let stopped: number | null = null;
  let next = 0;
  const lane = async () => {
    while (!stopped && next < urls.length) {
      const loc = urls[next++]!;
      try {
        const answer = await google<{ inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string } } }>(
          "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: siteUrl(loc), siteUrl: property }, "inspection");
        const s = section(pageSection(loc));
        s.inspected += 1;
        const status = answer.inspectionResult?.indexStatusResult;
        if (status?.verdict === "PASS") s.indexed += 1;
        else {
          const reason = status?.coverageState ?? "unknown";
          s.reasons![reason] = (s.reasons![reason] ?? 0) + 1;
        }
      } catch (error) {
        if ((error as { status?: number }).status !== 429) throw error;
        stopped = 429;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, INSPECTION_GAP_MS));
    }
  };
  await Promise.all(Array.from({ length: INSPECTION_LANES }, lane));

  const all = [...sections.values()];
  const reading = {
    week: week.start,
    clicks: Math.round(total?.clicks ?? 0),
    impressions: Math.round(total?.impressions ?? 0),
    inspected: all.reduce((n, s) => n + s.inspected, 0),
    indexed: all.reduce((n, s) => n + s.indexed, 0),
  };
  await sql`
    INSERT INTO search_console_weekly (week, property, clicks, impressions, inspected, indexed, sections)
    VALUES (${reading.week}, ${property}, ${reading.clicks}, ${reading.impressions}, ${reading.inspected}, ${reading.indexed}, ${sql.json(Object.fromEntries(sections) as never)})
    ON CONFLICT (week) DO UPDATE SET property = EXCLUDED.property, clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
      inspected = EXCLUDED.inspected, indexed = EXCLUDED.indexed, sections = EXCLUDED.sections, fetched_at = now()`;
  return { status: "read" as const, ...reading, urls: urls.length, ...(stopped ? { stopped } : {}) };
}
