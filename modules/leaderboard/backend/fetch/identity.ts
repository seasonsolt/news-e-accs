// Model identity: a source's own names map to one model through lb_aliases. A name seen for the first
// time is matched by its base name's slug; otherwise a new model is created (its release date comes
// from the source when it gives one) and the alias recorded, so the next fetch resolves directly.
// Later sources can replace machine names and unknown providers, but never curated directory metadata.
import { createId } from "@paralleldrive/cuid2";
import { sql } from "@aihot/backend/db";

/** "Llama 3 8B" → "llama-3-8-b"; "GPT-4o" → "gpt-4-o"; "v2.1" → "v-2-1". */
export function modelSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1-$2")
    .replace(/(\d)([a-z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface Model { id: string; slug: string; name: string; provider: string | null; metadata_source: string | null }

export class IdentityResolver {
  private aliases = new Map<string, string>();
  private slugs = new Map<string, string>();
  private models = new Map<string, Model>();
  private created: Array<{ id: string; slug: string; name: string }> = [];
  private renamed: Array<{ id: string; slug: string; from: string; to: string }> = [];

  readonly sourceKey: string;
  private readonly dryRun: boolean;

  constructor(sourceKey: string, dryRun = false) {
    this.sourceKey = sourceKey;
    this.dryRun = dryRun;
  }

  async load() {
    const rows = await sql<{ alias: string; model_id: string }[]>`SELECT alias, model_id FROM lb_aliases WHERE source_key = ${this.sourceKey}`;
    for (const r of rows) this.aliases.set(r.alias, r.model_id);
    const models = await sql<Model[]>`SELECT id, slug, name, provider, metadata_source FROM lb_models`;
    for (const m of models) {
      this.slugs.set(m.slug, m.id);
      this.models.set(m.id, m);
    }
    return this;
  }

  /** Only missing metadata needs a write; ordinary alias hits need no database query. */
  private async upgrade(id: string, baseName: string, organization?: string | null) {
    const model = this.models.get(id);
    if (!model || model.metadata_source === "directory" || this.dryRun) return;
    const name = !/[\sA-Z]/.test(model.name) && /[\sA-Z]/.test(baseName) && modelSlug(baseName) === model.slug ? baseName : model.name;
    const provider = (model.provider === "其他" || model.provider === null) && typeof organization === "string" && organization.trim() ? organization : model.provider;
    if (name === model.name && provider === model.provider) return;
    const [row] = await sql<Model[]>`
      UPDATE lb_models SET
        name = CASE WHEN name = ${model.name} THEN ${name} ELSE name END,
        provider = CASE WHEN provider IS NULL OR provider = '其他' THEN ${provider} ELSE provider END,
        updated_at = now()
      WHERE id = ${id} AND metadata_source IS DISTINCT FROM 'directory'
      RETURNING id, slug, name, provider, metadata_source`;
    if (!row) return;
    if (name !== model.name && row.name === name) this.renamed.push({ id, slug: model.slug, from: model.name, to: row.name });
    this.models.set(id, row);
  }

  /** Resolves a row's names to a model id, creating the model and alias when needed. */
  async resolve(names: string[], baseName: string, meta: { organization?: string | null; releasedAt?: string | null } = {}): Promise<string> {
    for (const n of names) {
      const hit = this.aliases.get(n);
      if (hit) {
        await this.upgrade(hit, baseName, meta.organization);
        return hit;
      }
    }
    const slug = modelSlug(baseName);
    let id = this.slugs.get(slug);
    if (!id) {
      id = createId();
      this.slugs.set(slug, id);
      this.created.push({ id, slug, name: baseName });
      this.models.set(id, { id, slug, name: baseName, provider: meta.organization ?? "其他", metadata_source: this.sourceKey });
      if (!this.dryRun) {
        await sql`
          INSERT INTO lb_models (id, slug, name, provider, provider_slug, released_at, release_date_source, metadata_source, created_at, updated_at)
          VALUES (${id}, ${slug}, ${baseName}, ${meta.organization ?? "其他"}, ${"other"}, ${meta.releasedAt ?? null}, ${meta.releasedAt ? this.sourceKey : null}, ${this.sourceKey}, now(), now())
          ON CONFLICT (slug) DO NOTHING`;
        const [row] = await sql<Model[]>`SELECT id, slug, name, provider, metadata_source FROM lb_models WHERE slug = ${slug}`;
        id = row!.id;
        this.slugs.set(slug, id);
        this.models.set(id, row!);
      }
    } else {
      await this.upgrade(id, baseName, meta.organization);
    }
    for (const n of names) {
      this.aliases.set(n, id);
      if (!this.dryRun) {
        await sql`INSERT INTO lb_aliases (id, source_key, alias, normalized_alias, model_id) VALUES (${createId()}, ${this.sourceKey}, ${n}, ${slug}, ${id})
                  ON CONFLICT DO NOTHING`;
      }
    }
    return id;
  }

  get newModels() {
    return this.created;
  }

  get renamedModels() {
    return this.renamed;
  }
}
