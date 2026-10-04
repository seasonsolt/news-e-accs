// Later evaluation sources improve machine-named models without overwriting curated directory names
// or known providers. Alias and slug hits share the upgrade, repeated rows need no write, and
// dry runs leave both models and aliases untouched. Every fixture has a run-specific slug.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createId } from "@paralleldrive/cuid2";
import { closeDb, sql } from "@aihot/backend/db";
import { IdentityResolver, modelSlug } from "@aihot/backend/leaderboard/fetch/identity";
import { configurationOf } from "@aihot/backend/leaderboard/fetch/configuration";
import { resolveRows, storeSnapshot } from "@aihot/backend/leaderboard/fetch/store";
import type { FetchResult } from "@aihot/backend/leaderboard/fetch/types";

const T = tag();
const SOURCE = `identity-${T}`;
const ids: string[] = [];
interface Model { id: string; slug: string; name: string; provider: string | null; provider_slug: string | null; metadata_source: string | null; updated_at: Date }
const read = async (id: string) => (await sql<Model[]>`SELECT id, slug, name, provider, provider_slug, metadata_source, updated_at FROM lb_models WHERE id = ${id}`)[0]!;

async function fixture(key: string, opts: { name?: string; provider?: string | null; metadataSource?: string | null; alias?: boolean } = {}) {
  const id = createId();
  const display = `GPT-6.1 Sol ${T} ${key}`;
  const name = opts.name ?? display.toLowerCase().replace(/ /g, "-");
  const slug = modelSlug(display);
  const alias = `upstream-${slug}`;
  ids.push(id);
  await sql`INSERT INTO lb_models (id, slug, name, provider, provider_slug, metadata_source, updated_at)
            VALUES (${id}, ${slug}, ${name}, ${opts.provider === undefined ? "其他" : opts.provider}, 'other', ${opts.metadataSource === undefined ? SOURCE : opts.metadataSource}, '2000-01-01')`;
  if (opts.alias) {
    await sql`INSERT INTO lb_aliases (id, source_key, alias, normalized_alias, model_id)
              VALUES (${createId()}, ${SOURCE}, ${alias}, ${slug}, ${id})`;
  }
  return { id, slug, name, display, alias };
}

after(async () => {
  await sql`DELETE FROM lb_scores WHERE snapshot_id IN (SELECT id FROM lb_snapshots WHERE source_key = ${SOURCE})`;
  await sql`DELETE FROM lb_snapshots WHERE source_key = ${SOURCE}`;
  await sql`DELETE FROM lb_aliases WHERE source_key = ${SOURCE}`;
  if (ids.length) await sql`DELETE FROM lb_models WHERE id IN ${sql(ids)}`;
  await closeDb();
});

for (const path of ["alias", "slug"]) {
  test(`an identifier becomes a display name through a ${path} hit, once`, async () => {
    const m = await fixture(`rename-${path}`, { alias: path === "alias" });
    const resolver = await new IdentityResolver(SOURCE).load();
    assert.equal(await resolver.resolve([m.alias], m.display, { organization: "OpenAI" }), m.id);
    const row = await read(m.id);
    assert.equal(row.name, m.display);
    assert.equal(row.provider, "OpenAI");
    assert.equal(row.provider_slug, "other", "provider_slug is not inferred from the organization");
    assert.equal(row.metadata_source, SOURCE);
    assert.ok(row.updated_at > new Date("2000-01-01"));
    assert.deepEqual(resolver.renamedModels, [{ id: m.id, slug: m.slug, from: m.name, to: m.display }]);
    assert.deepEqual(resolver.newModels, []);

    await resolver.resolve([m.alias], m.display, { organization: "Another organization" });
    assert.deepEqual(await read(m.id), row, "a repeated row does not write again");
    assert.equal(resolver.renamedModels.length, 1);
    assert.equal((await sql`SELECT id FROM lb_aliases WHERE source_key = ${SOURCE} AND alias = ${m.alias}`).length, 1);
  });

  test(`directory metadata is untouched through a ${path} hit`, async () => {
    const m = await fixture(`directory-${path}`, { alias: path === "alias", metadataSource: "directory" });
    const before = await read(m.id);
    const resolver = await new IdentityResolver(SOURCE).load();
    assert.equal(await resolver.resolve([m.alias], m.display, { organization: "OpenAI" }), m.id);
    assert.deepEqual(await read(m.id), before);
    assert.deepEqual(resolver.renamedModels, []);
  });

  test(`a dry-run ${path} hit writes neither metadata nor aliases`, async () => {
    const m = await fixture(`dry-${path}`, { alias: path === "alias" });
    const before = await read(m.id);
    const aliases = await sql`SELECT id FROM lb_aliases WHERE source_key = ${SOURCE}`;
    const resolver = await new IdentityResolver(SOURCE, true).load();
    assert.equal(await resolver.resolve([m.alias], m.display, { organization: "OpenAI" }), m.id);
    assert.deepEqual(await read(m.id), before);
    assert.deepEqual(await sql`SELECT id FROM lb_aliases WHERE source_key = ${SOURCE}`, aliases);
    assert.deepEqual(resolver.renamedModels, []);
    assert.deepEqual(resolver.newModels, []);
  });
}

test("an alias with a configuration suffix cannot rename the base model", async () => {
  const m = await fixture("fallback", { alias: true });
  const before = await read(m.id);
  const resolver = await new IdentityResolver(SOURCE).load();
  assert.equal(await resolver.resolve([m.alias], `${m.display} (Medium, Default Fallback)`), m.id);
  assert.deepEqual(await read(m.id), before);
  assert.deepEqual(resolver.renamedModels, []);
});

test("whitespace or an uppercase letter already makes the current name a display name", async () => {
  for (const name of [`gpt sol ${T}`, `GPT-sol-${T}`]) {
    const m = await fixture(`display-${ids.length}`, { name, alias: true, provider: "OpenAI" });
    const before = await read(m.id);
    const resolver = await new IdentityResolver(SOURCE).load();
    await resolver.resolve([m.alias], m.display, { organization: "Different provider" });
    assert.deepEqual(await read(m.id), before);
    assert.deepEqual(resolver.renamedModels, []);
  }
});

test("a new identifier is not a display name even when its slug matches", async () => {
  const m = await fixture("machine", { alias: true });
  const before = await read(m.id);
  const resolver = await new IdentityResolver(SOURCE).load();
  await resolver.resolve([m.alias], m.slug);
  assert.deepEqual(await read(m.id), before);
  assert.deepEqual(resolver.renamedModels, []);
});

test("null and unknown providers upgrade independently of the name; real providers stay", async () => {
  for (const provider of [null, "其他", "Known provider"]) {
    const m = await fixture(`provider-${ids.length}`, { provider, alias: true });
    const resolver = await new IdentityResolver(SOURCE).load();
    await resolver.resolve([m.alias], `${m.display} (Medium)`, { organization: "OpenAI" });
    const row = await read(m.id);
    assert.equal(row.name, m.name, "a mismatched slug does not block the independent provider upgrade");
    assert.equal(row.provider, provider === "Known provider" ? provider : "OpenAI");
    assert.equal(row.provider_slug, "other");
    assert.deepEqual(resolver.renamedModels, []);
    await resolver.resolve([m.alias], `${m.display} (Medium)`, { organization: "Different provider" });
    assert.deepEqual(await read(m.id), row);
  }
});

test("a provider-only upgrade preserves an externally changed display name", async () => {
  const m = await fixture("stale-name", { alias: true });
  const resolver = await new IdentityResolver(SOURCE).load();
  const display = `${m.display} Curated`;
  await sql`UPDATE lb_models SET name = ${display} WHERE id = ${m.id}`;
  await resolver.resolve([m.alias], `${m.display} (Medium)`, { organization: "OpenAI" });
  const row = await read(m.id);
  assert.equal(row.name, display);
  assert.equal(row.provider, "OpenAI");
  assert.deepEqual(resolver.renamedModels, []);

  await resolver.resolve([m.alias], m.display, { organization: "Different provider" });
  assert.deepEqual(await read(m.id), row, "the returned metadata prevents another write from the stale copy");
  assert.deepEqual(resolver.renamedModels, []);
});

test("a provider-only upgrade does not block a later rename in the same resolver", async () => {
  const m = await fixture("provider-then-name", { alias: true });
  const resolver = await new IdentityResolver(SOURCE).load();
  await resolver.resolve([m.alias], `${m.display} (Medium)`, { organization: "OpenAI" });
  const providerOnly = await read(m.id);
  assert.equal(providerOnly.name, m.name);
  assert.equal(providerOnly.provider, "OpenAI");
  assert.deepEqual(resolver.renamedModels, []);

  await resolver.resolve([m.alias], m.display, { organization: "Different provider" });
  const row = await read(m.id);
  assert.equal(row.name, m.display);
  assert.equal(row.provider, "OpenAI");
  assert.deepEqual(resolver.renamedModels, [{ id: m.id, slug: m.slug, from: m.name, to: m.display }]);
  await resolver.resolve([m.alias], m.display, { organization: "Different provider" });
  assert.deepEqual(await read(m.id), row, "a repeated row does not write again");
  assert.equal(resolver.renamedModels.length, 1);
});

test("missing, empty and whitespace-only organizations leave unknown providers untouched", async () => {
  for (const organization of [undefined, null, "", "   "]) {
    const m = await fixture(`empty-${ids.length}`, { alias: true });
    const before = await read(m.id);
    const resolver = await new IdentityResolver(SOURCE).load();
    await resolver.resolve([m.alias], m.name, { organization });
    assert.deepEqual(await read(m.id), before);
  }
});

test("a successful rename does not overwrite a real provider", async () => {
  const m = await fixture("known-provider", { provider: "Known provider" });
  const resolver = await new IdentityResolver(SOURCE).load();
  await resolver.resolve([m.alias], m.display, { organization: "OpenAI" });
  const row = await read(m.id);
  assert.equal(row.name, m.display);
  assert.equal(row.provider, "Known provider");
  assert.equal(row.provider_slug, "other");
});

test("fetch results report renames alongside new models, including unchanged snapshots", async () => {
  const m = await fixture("reporting");
  const result: FetchResult = {
    sourceKey: SOURCE, sourceName: "Identity test", sourceUrl: "https://example.org/identity",
    license: "test", attributionUrl: "https://example.org/identity", publishedAt: null, metadata: {},
    rows: [{ sourceModelName: m.alias, baseName: m.display, organization: "OpenAI", configuration: configurationOf([]), metricKey: "identity-test", metricName: "Identity test", rawScore: 1 }],
  };
  const dry = await resolveRows(result, true);
  assert.deepEqual(dry.newModels, []);
  assert.deepEqual(dry.renamedModels, []);
  const first = await storeSnapshot(result);
  assert.equal(first.newModels, 0);
  assert.equal(first.renamedModels, 1);
  const [snapshot] = await sql<{ metadata: { newModelCount: number; renamedModelCount: number } }[]>`SELECT metadata FROM lb_snapshots WHERE id = ${first.snapshotId}`;
  assert.equal(snapshot?.metadata.newModelCount, 0);
  assert.equal(snapshot?.metadata.renamedModelCount, 1);

  await sql`UPDATE lb_models SET name = ${m.name} WHERE id = ${m.id}`;
  const unchanged = await storeSnapshot(result);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.newModels, 0);
  assert.equal(unchanged.renamedModels, 1);
  assert.equal((await read(m.id)).name, m.display);
});
