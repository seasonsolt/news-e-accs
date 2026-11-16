// The writing desk's records (essays, essay_revisions, essay_tasks, essay_images, essay_publications) and
// every change the admin makes to them. Model work is only ever queued here; the worker does it
// (backend/tasks.ts). Text fields carry an optimistic version: a save against an older view is refused.
// Picture words (prompt, alt) save on their own, and the worker only ever writes a picture's file.
import { createHash, randomBytes } from "node:crypto";
import { sql, type Db } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { audit, Conflict } from "@aihot/backend/audit";
import { getObject, ObjectStoreError, putObject } from "@aihot/backend/lib/objects";
import { codexConfigured, saveJpeg } from "@aihot/backend/providers/codex";
import {
  ESSAY_LANGUAGES, essayPath, type EssayDetail, type EssayEdition, type EssayImage, type EssayImageSave, type EssayLanguage, type EssayList,
  type EssayRevision, type EssaySave, type EssayTask, type EssayTaskKind, type EssayTaskRequest,
} from "../contracts.ts";
import { edition, figureSlots, hasCheck, renderBody, sections, SLUG, wordCount, type FigureImage } from "./render.ts";
import { DEFAULT_STYLE, essayStyles, publicStyle, styleExists } from "./styles.ts";

/** The pictures' folder in the object store (lib/objects.ts). */
export const PICTURES = "essays";

/** A stored picture's bytes; a file the database names but the store lacks is an error. */
export async function pictureBytes(file: string): Promise<Buffer> {
  const bytes = await getObject(`${PICTURES}/${file}`);
  if (!bytes) throw new Error(`essay picture ${file} is missing from the object store`);
  return bytes;
}
export const FILE = /^[0-9a-f]{32}\.jpg$/;
export const SLOT = /^(cover|figure-[1-9])$/;
export const ADMIN_MEDIA = "/api/admin/essays/media";

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400 });
const missing = () => Object.assign(new Error("没有这篇文章。"), { statusCode: 404 });

export interface EssayRow {
  id: number;
  slug: string;
  status: EssayDetail["status"];
  style: string;
  fragments: string;
  refs: string[];
  outline: string;
  editions: Partial<Record<EssayLanguage, unknown>>;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface ImageRow {
  slot: string;
  prompt: string;
  alt: Partial<Record<EssayLanguage, string>>;
  file: string | null;
  width: number | null;
  height: number | null;
  origin: EssayImage["origin"];
  credit: string | null;
  candidates: Array<{ file: string; page: string }>;
}

export async function essayRow(db: Db, id: number, lock = false): Promise<EssayRow> {
  const [row] = lock
    ? await db<EssayRow[]>`SELECT * FROM essays WHERE id = ${id} FOR UPDATE`
    : await db<EssayRow[]>`SELECT * FROM essays WHERE id = ${id}`;
  if (!row) throw missing();
  return { ...row, id: Number(row.id) };
}

export const editionsOf = (row: Pick<EssayRow, "editions">): Record<EssayLanguage, EssayEdition> =>
  ({ en: edition(row.editions.en), zh: edition(row.editions.zh) });

export async function imageRows(db: Db, id: number): Promise<ImageRow[]> {
  return db<ImageRow[]>`SELECT slot, prompt, alt, file, width, height, origin, credit, candidates FROM essay_images WHERE essay_id = ${id}
    ORDER BY slot = 'cover' DESC, slot`;
}

/** The pictures with a file, by slot, as the body renders them in `language`. */
export function figuresOf(images: ImageRow[], language: EssayLanguage): Record<string, FigureImage> {
  return Object.fromEntries(images.filter((i) => i.file && i.width && i.height).map((i) => [i.slot, {
    file: i.file!, width: i.width!, height: i.height!, alt: i.alt[language] ?? "", credit: i.credit,
  }]));
}

/** What stops publishing: both editions complete and checked, every placed picture present and described. */
export function publishProblems(row: EssayRow, images: ImageRow[]): string[] {
  const out: string[] = [];
  const editions = editionsOf(row);
  const name = { en: "英文版", zh: "中文版" } as const;
  for (const language of ESSAY_LANGUAGES) {
    const e = editions[language];
    const empty = (["title", "dek", "description", "body"] as const).filter((k) => !e[k].trim());
    if (empty.length) out.push(`${name[language]}缺少：${empty.map((k) => ({ title: "标题", dek: "导语", description: "搜索摘要", body: "正文" })[k]).join("、")}。`);
    if (hasCheck(e)) out.push(`${name[language]}还有 [[check: …]] 没有处理。`);
  }
  const en = figureSlots(editions.en.body).sort().join(",");
  const zh = figureSlots(editions.zh.body).sort().join(",");
  if (editions.zh.body.trim() && en !== zh) out.push("中英两版放的图位不一样。");
  const bySlot = new Map(images.map((i) => [i.slot, i]));
  for (const slot of ["cover", ...figureSlots(editions.en.body)]) {
    const image = bySlot.get(slot);
    if (!image?.file) out.push(slot === "cover" ? "还没有封面图。" : `图位 ${slot} 还没有图。`);
    else for (const language of ESSAY_LANGUAGES) if (!image.alt[language]?.trim()) out.push(`${slot} 缺少${language === "en" ? "英文" : "中文"}替代文字。`);
  }
  if (!SLUG.test(row.slug) || row.slug.startsWith("essay-draft-")) out.push("网址（slug）还是临时的，改一个正式的。");
  return out;
}

export function writingUnavailable(): string | null {
  return config.modelCallsEnabled ? null : "模型调用没有打开（MODEL_CALLS_ENABLED），只能手写和编辑。";
}

export function picturesUnavailable(): string | null {
  if (!codexConfigured()) return "没有配置 CODEX_BIN，不能搜图和画图，只能上传。";
  return writingUnavailable() && "模型调用没有打开（MODEL_CALLS_ENABLED），不能搜图和画图，只能上传。";
}

const iso = (d: Date | string) => new Date(d).toISOString();

function taskOf(r: { id: number; kind: EssayTaskKind; status: EssayTask["status"]; input: EssayTask["input"]; result: EssayTask["result"]; error: string | null; requested_by: string; created_at: Date; updated_at: Date }): EssayTask {
  return { id: Number(r.id), kind: r.kind, status: r.status, input: r.input, result: r.result, error: r.error, requestedBy: r.requested_by, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) };
}

export async function essayDetail(id: number): Promise<EssayDetail> {
  const row = await essayRow(sql, id);
  const [images, tasks, revisions, live, first] = await Promise.all([
    imageRows(sql, id),
    sql`SELECT * FROM essay_tasks WHERE essay_id = ${id} AND (status IN ('queued', 'running', 'failed') OR (kind = 'revise' AND status = 'done') OR updated_at > now() - interval '1 day')
      ORDER BY id DESC LIMIT 30`,
    sql<{ id: number; part: EssayRevision["part"]; source: EssayRevision["source"]; style: string | null; created_by: string; created_at: Date }[]>`
      SELECT id, part, source, style, created_by, created_at FROM essay_revisions WHERE essay_id = ${id} ORDER BY id DESC LIMIT 60`,
    sql<{ published_at: Date; first_published_at: Date; slug: string }[]>`SELECT published_at, first_published_at, slug FROM essay_publications WHERE essay_id = ${id} AND status = 'live'`,
    sql`SELECT 1 FROM essay_publications WHERE essay_id = ${id} LIMIT 1`,
  ]);
  return {
    id: row.id, slug: row.slug, slugLocked: first.length > 0, status: row.status, style: row.style, fragments: row.fragments, refs: row.refs, outline: row.outline,
    editions: editionsOf(row),
    images: images.map((i) => ({ ...i, candidates: i.candidates })),
    version: row.version,
    tasks: tasks.map((t) => taskOf(t as never)),
    revisions: revisions.map((r) => ({ id: Number(r.id), part: r.part, source: r.source, style: r.style, createdBy: r.created_by, createdAt: iso(r.created_at) })),
    problems: publishProblems(row, images),
    live: live[0] ? { publishedAt: iso(live[0].first_published_at), modifiedAt: iso(live[0].published_at), path: essayPath(live[0].slug, "en") } : null,
    writingUnavailable: writingUnavailable(),
    picturesUnavailable: picturesUnavailable(),
    styles: (await essayStyles()).map(publicStyle),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

export async function listEssays(): Promise<EssayList> {
  const rows = await sql<{ id: number; slug: string; status: EssayDetail["status"]; editions: EssayRow["editions"]; outline: string; fragments: string;
    updated_at: Date; working: EssayTaskKind | null; failed: number; published_at: Date | null }[]>`
    SELECT e.id, e.slug, e.status, e.editions, e.outline, e.fragments, e.updated_at,
      (SELECT kind FROM essay_tasks t WHERE t.essay_id = e.id AND t.status IN ('queued', 'running') ORDER BY t.id LIMIT 1) AS working,
      (SELECT count(*)::int FROM essay_tasks t WHERE t.essay_id = e.id AND t.status = 'failed') AS failed,
      (SELECT min(first_published_at) FROM essay_publications p WHERE p.essay_id = e.id) AS published_at
    FROM essays e ORDER BY e.updated_at DESC, e.id DESC LIMIT 200`;
  return {
    essays: rows.map((r) => ({
      id: Number(r.id), slug: r.slug, status: r.status, working: r.working, failed: r.failed, updatedAt: iso(r.updated_at), publishedAt: r.published_at && iso(r.published_at),
      title: edition(r.editions.en).title || edition(r.editions.zh).title || r.fragments.trim().split("\n")[0]!.slice(0, 80) || `#${r.id}`,
    })),
    styles: (await essayStyles()).map(publicStyle),
  };
}

function cleanRefs(refs: unknown): string[] {
  if (!Array.isArray(refs)) throw bad("参考必须是网址列表。");
  const out = refs.map((r) => String(r).trim()).filter(Boolean);
  if (out.length > 20) throw bad("参考最多 20 个。");
  for (const r of out) if (!/^(https?:\/\/|\/)\S+$/.test(r) || r.length > 500) throw bad(`参考要是网址或本站路径：${r.slice(0, 80)}`);
  return out;
}

/** The style's name if it can be used; inside a transaction it also holds an uploaded style until commit. */
async function checkStyle(name: string, db: Db = sql): Promise<string> {
  if (!(await styleExists(name, db))) throw bad(`没有这个文风：${name}`);
  return name;
}

export async function createEssay(input: { fragments?: unknown; refs?: unknown; style?: unknown }, actor: string): Promise<{ id: number }> {
  const fragments = String(input.fragments ?? "");
  if (fragments.length > 100_000) throw bad("碎片太长了（上限 10 万字）。");
  const style = await checkStyle(String(input.style ?? DEFAULT_STYLE));
  const refs = cleanRefs(input.refs ?? []);
  const slug = `essay-draft-${randomBytes(4).toString("hex")}`;
  const [row] = await sql<{ id: number }[]>`INSERT INTO essays (slug, style, fragments, refs, created_by)
    VALUES (${slug}, ${style}, ${fragments}, ${sql.json(refs)}, ${actor}) RETURNING id`;
  const id = Number(row!.id);
  await audit(actor, "essay.create", `essay:${id}`, null, null, { style, refs }, {});
  return { id };
}

/** A revision of `part`; a manual save within ten minutes of the same person's last manual save of it replaces that one. */
export async function recordRevision(db: Db, essayId: number, part: EssayRevision["part"], source: EssayRevision["source"], content: unknown,
  actor: string, extra: { style?: string | null; styleHash?: string | null; receiptId?: number | null } = {}) {
  if (source === "manual") {
    const [last] = await db<{ id: number; source: string; created_by: string; created_at: Date }[]>`
      SELECT id, source, created_by, created_at FROM essay_revisions WHERE essay_id = ${essayId} AND part = ${part} ORDER BY id DESC LIMIT 1`;
    if (last && last.source === "manual" && last.created_by === actor && Date.now() - new Date(last.created_at).getTime() < 10 * 60_000) {
      await db`UPDATE essay_revisions SET content = ${db.json(content as never)}, created_at = now() WHERE id = ${last.id}`;
      return;
    }
  }
  await db`INSERT INTO essay_revisions (essay_id, part, source, content, style, style_hash, receipt_id, created_by)
    VALUES (${essayId}, ${part}, ${source}, ${db.json(content as never)}, ${extra.style ?? null}, ${extra.styleHash ?? null}, ${extra.receiptId ?? null}, ${actor})`;
}

/** Text fields a queued or running task will write: saving them now would be overwritten. */
const WRITES: Partial<Record<EssayTaskKind, Array<"outline" | EssayLanguage>>> = { outline: ["outline"], draft: ["en"], localize: ["zh"] };

async function activeWrites(db: Db, id: number): Promise<Set<string>> {
  const rows = await db<{ kind: EssayTaskKind }[]>`SELECT kind FROM essay_tasks WHERE essay_id = ${id} AND status IN ('queued', 'running')`;
  return new Set(rows.flatMap((r) => WRITES[r.kind] ?? []));
}

function cleanEdition(value: unknown): EssayEdition {
  const e = edition(value);
  if (e.title.length > 300 || e.dek.length > 1000 || e.description.length > 400 || e.body.length > 200_000) throw bad("标题、导语、摘要或正文太长了。");
  return e;
}

export async function saveEssay(id: number, save: EssaySave, actor: string): Promise<EssayDetail> {
  await sql.begin(async (tx) => {
    const row = await essayRow(tx, id, true);
    if (row.version !== save.version) throw new Conflict("这篇文章在别处改过了（或 worker 刚写完一步），刷新后再改。");
    const busy = await activeWrites(tx, id);
    const set: Record<string, unknown> = {};
    if (save.slug !== undefined && save.slug !== row.slug) {
      const [published] = await tx`SELECT 1 FROM essay_publications WHERE essay_id = ${id} LIMIT 1`;
      if (published) throw new Conflict("发布过的文章不能改网址。");
      if (!SLUG.test(save.slug) || save.slug.length > 80) throw bad("网址只能用小写字母、数字和连字符，最长 80 个字符。");
      const [taken] = await tx`SELECT 1 FROM essays WHERE slug = ${save.slug} AND id <> ${id}`;
      if (taken) throw new Conflict("这个网址已经有文章用了。");
      set.slug = save.slug;
    }
    if (save.style !== undefined && save.style !== row.style) set.style = await checkStyle(save.style, tx);
    if (save.fragments !== undefined) {
      if (save.fragments.length > 100_000) throw bad("碎片太长了（上限 10 万字）。");
      set.fragments = save.fragments;
    }
    if (save.refs !== undefined) set.refs = tx.json(cleanRefs(save.refs));
    if (save.outline !== undefined && save.outline !== row.outline) {
      if (busy.has("outline")) throw new Conflict("提纲正在生成，等它写完再改。");
      if (save.outline.length > 50_000) throw bad("提纲太长了。");
      set.outline = save.outline;
      await recordRevision(tx, id, "outline", "manual", { text: save.outline }, actor);
    }
    const editions = editionsOf(row);
    let changed = false;
    for (const language of ESSAY_LANGUAGES) {
      const next = save.editions?.[language];
      if (next === undefined) continue;
      const clean = cleanEdition(next);
      if (JSON.stringify(clean) === JSON.stringify(editions[language])) continue;
      if (busy.has(language)) throw new Conflict(`${language === "en" ? "英文稿" : "中文版"}正在生成，等它写完再改。`);
      editions[language] = clean;
      changed = true;
      await recordRevision(tx, id, language, "manual", clean, actor);
    }
    if (changed) set.editions = tx.json(editions as never);
    if (!Object.keys(set).length) return;
    await tx`UPDATE essays SET ${tx(set as Record<string, never>)}, version = version + 1, updated_at = now() WHERE id = ${id}`;
    await audit(actor, "essay.save", `essay:${id}`, null, null, { fields: Object.keys(set) }, { db: tx });
  });
  return essayDetail(id);
}

export async function saveImage(id: number, slot: string, save: EssayImageSave, actor: string): Promise<EssayDetail> {
  if (!SLOT.test(slot)) throw bad("图位只能是 cover 或 figure-1 到 figure-9。");
  await essayRow(sql, id);
  const prompt = save.prompt === undefined ? null : String(save.prompt).slice(0, 4000);
  const alt = save.alt === undefined ? null : Object.fromEntries(ESSAY_LANGUAGES.flatMap((l) => (typeof save.alt?.[l] === "string" ? [[l, save.alt[l]!.slice(0, 500)]] : [])));
  await sql`INSERT INTO essay_images (essay_id, slot, prompt, alt) VALUES (${id}, ${slot}, ${prompt ?? ""}, ${sql.json(alt ?? {})})
    ON CONFLICT (essay_id, slot) DO UPDATE SET prompt = coalesce(${prompt}, essay_images.prompt),
      alt = essay_images.alt || ${sql.json(alt ?? {})}, updated_at = now()`;
  await audit(actor, "essay.image", `essay:${id}`, null, null, { slot, prompt: prompt !== null, alt: alt && Object.keys(alt) }, {});
  return essayDetail(id);
}

export async function removeImage(id: number, slot: string, actor: string): Promise<EssayDetail> {
  if (!SLOT.test(slot)) throw bad("图位只能是 cover 或 figure-1 到 figure-9。");
  const [busy] = await sql`SELECT 1 FROM essay_tasks WHERE essay_id = ${id} AND lane = ${`image:${slot}`} AND status IN ('queued', 'running')`;
  if (busy) throw new Conflict("这个图位正在找图或画图，等它完成。");
  await sql`DELETE FROM essay_images WHERE essay_id = ${id} AND slot = ${slot}`;
  await audit(actor, "essay.image.remove", `essay:${id}`, null, null, { slot }, {});
  return essayDetail(id);
}

async function pictureSize(file: string): Promise<{ width: number; height: number }> {
  const { default: sharp } = await import("sharp");
  const meta = await sharp(await pictureBytes(file)).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Takes one of the search's candidates as the slot's picture, credited to its page. */
export async function chooseCandidate(id: number, slot: string, file: string, actor: string): Promise<EssayDetail> {
  const [image] = await sql<ImageRow[]>`SELECT * FROM essay_images WHERE essay_id = ${id} AND slot = ${slot}`;
  const candidate = image?.candidates.find((c) => c.file === file);
  if (!candidate || !FILE.test(file)) throw bad("候选里没有这张图。");
  const size = await pictureSize(file);
  await sql`UPDATE essay_images SET file = ${file}, width = ${size.width}, height = ${size.height}, origin = 'search', credit = ${candidate.page}, updated_at = now()
    WHERE essay_id = ${id} AND slot = ${slot}`;
  await audit(actor, "essay.image.choose", `essay:${id}`, null, null, { slot, page: candidate.page }, {});
  return essayDetail(id);
}

export async function uploadImage(id: number, slot: string, image: Buffer, actor: string): Promise<EssayDetail> {
  if (!SLOT.test(slot)) throw bad("图位只能是 cover 或 figure-1 到 figure-9。");
  await essayRow(sql, id);
  let saved;
  try {
    saved = await saveJpeg(image, PICTURES);
  } catch (error) {
    if (error instanceof ObjectStoreError) throw error;
    throw bad("读不出这张图，换 PNG、JPEG 或 WebP。");
  }
  await sql`INSERT INTO essay_images (essay_id, slot, file, width, height, origin) VALUES (${id}, ${slot}, ${saved.file}, ${saved.width}, ${saved.height}, 'uploaded')
    ON CONFLICT (essay_id, slot) DO UPDATE SET file = EXCLUDED.file, width = EXCLUDED.width, height = EXCLUDED.height, origin = 'uploaded', credit = NULL, updated_at = now()`;
  await audit(actor, "essay.image.upload", `essay:${id}`, null, null, { slot, file: saved.file }, {});
  return essayDetail(id);
}

/** The body as the public page will print it, with the admin's picture addresses. */
export async function previewEssay(id: number, language: EssayLanguage, body: string): Promise<{ html: string }> {
  const images = await imageRows(sql, id);
  return { html: renderBody(body, { media: ADMIN_MEDIA, figures: figuresOf(images, language), language }) };
}

export async function revisionContent(id: number, revisionId: number): Promise<{ part: EssayRevision["part"]; content: unknown }> {
  const [row] = await sql<{ part: EssayRevision["part"]; content: unknown }[]>`SELECT part, content FROM essay_revisions WHERE id = ${revisionId} AND essay_id = ${id}`;
  if (!row) throw missing();
  return row;
}

// ---- Tasks

const LANES: Record<EssayTaskKind, (r: EssayTaskRequest) => string> = {
  outline: () => "text", draft: () => "text", revise: () => "text", localize: () => "text",
  search: (r) => `image:${r.slot}`, draw: (r) => `image:${r.slot}`,
};

/** Queues work for the worker. Text work needs the essay as the author saved it (`version`). */
export async function requestTask(id: number, version: number, request: EssayTaskRequest, actor: string, enqueue: (taskId: number, tx: Db) => Promise<unknown>): Promise<EssayDetail> {
  const kind = request.kind;
  if (!(kind in LANES)) throw bad("不认识的任务。");
  const pictures = kind === "search" || kind === "draw";
  const unavailable = pictures ? picturesUnavailable() : writingUnavailable();
  if (unavailable) throw new Conflict(unavailable);
  await sql.begin(async (tx) => {
    const row = await essayRow(tx, id, true);
    if (!pictures && row.version !== version) throw new Conflict("这篇文章在别处改过了，刷新后再请求。");
    const editions = editionsOf(row);
    let input: EssayTask["input"] = {};
    if (kind === "outline" && !row.fragments.trim()) throw bad("先写一些碎片。");
    if (kind === "draft" && !row.outline.trim()) throw bad("先生成或写好提纲。");
    if (kind === "localize" && !editions.en.body.trim()) throw bad("先有英文稿，再出中文版。");
    if (kind === "revise") {
      const language = request.language === "zh" ? "zh" : "en";
      const parts = sections(editions[language].body);
      const section = Number(request.section);
      const instruction = String(request.instruction ?? "").trim();
      if (!Number.isInteger(section) || section < 0 || section >= parts.length || !parts[section]!.trim()) throw bad("没有这一节。");
      if (!instruction || instruction.length > 2000) throw bad("写一句要怎么改（2000 字以内）。");
      input = { language, section, instruction };
    }
    if (pictures) {
      if (!SLOT.test(String(request.slot))) throw bad("图位只能是 cover 或 figure-1 到 figure-9。");
      const [image] = await tx<{ prompt: string }[]>`SELECT prompt FROM essay_images WHERE essay_id = ${id} AND slot = ${request.slot!}`;
      if (!image?.prompt.trim()) throw bad("先写这张图要画什么、搜什么。");
      input = { slot: request.slot };
    }
    const lane = LANES[kind](request);
    const [busy] = await tx`SELECT kind FROM essay_tasks WHERE essay_id = ${id} AND lane = ${lane} AND status IN ('queued', 'running')`;
    if (busy) throw new Conflict(pictures ? "这个图位正在找图或画图，等它完成。" : "上一步还在写，等它完成。");
    const [task] = await tx<{ id: number }[]>`INSERT INTO essay_tasks (essay_id, kind, lane, input, requested_by)
      VALUES (${id}, ${kind}, ${lane}, ${tx.json(input as never)}, ${actor}) RETURNING id`;
    await enqueue(Number(task!.id), tx);
    await audit(actor, `essay.task.${kind}`, `essay:${id}`, null, null, { taskId: Number(task!.id), ...input }, { db: tx });
  });
  return essayDetail(id);
}

/** Puts a proposed section rewrite into the body (accept) or drops it (discard). */
export async function resolveRevision(id: number, taskId: number, version: number, accept: boolean, actor: string): Promise<EssayDetail> {
  await sql.begin(async (tx) => {
    const row = await essayRow(tx, id, true);
    const [task] = await tx<{ status: string; kind: string; input: EssayTask["input"]; result: EssayTask["result"]; receipt_id: number | null }[]>`
      SELECT status, kind, input, result, receipt_id FROM essay_tasks WHERE id = ${taskId} AND essay_id = ${id} FOR UPDATE`;
    if (!task || task.kind !== "revise" || task.status !== "done" || !task.result?.text) throw new Conflict("这个改写已经处理过了。");
    if (accept) {
      if (row.version !== version) throw new Conflict("这篇文章在别处改过了，刷新后再采纳。");
      const language = task.input.language === "zh" ? "zh" : "en";
      const editions = editionsOf(row);
      const parts = sections(editions[language].body);
      const at = parts[task.input.section!] === task.result.base ? task.input.section! : parts.indexOf(task.result.base ?? "");
      if (at < 0) throw new Conflict("这一节在请求之后改过了，丢弃这个改写，重新请求。");
      parts[at] = task.result.text.replace(/\n+$/, "") + (parts[at]!.endsWith("\n") ? "\n" : "");
      editions[language] = { ...editions[language], body: parts.join("\n") };
      await tx`UPDATE essays SET editions = ${tx.json(editions as never)}, version = version + 1, updated_at = now() WHERE id = ${id}`;
      await recordRevision(tx, id, language, "revise", editions[language], actor, { receiptId: task.receipt_id });
    }
    await tx`UPDATE essay_tasks SET status = ${accept ? "accepted" : "discarded"}, updated_at = now() WHERE id = ${taskId}`;
    await audit(actor, accept ? "essay.revise.accept" : "essay.revise.discard", `essay:${id}`, null, null, { taskId }, { db: tx });
  });
  return essayDetail(id);
}

/** Clears a failed task from the desk. */
export async function dismissTask(id: number, taskId: number, actor: string): Promise<EssayDetail> {
  await sql`UPDATE essay_tasks SET status = 'discarded', updated_at = now() WHERE id = ${taskId} AND essay_id = ${id} AND status = 'failed'`;
  await audit(actor, "essay.task.dismiss", `essay:${id}`, null, null, { taskId }, {});
  return essayDetail(id);
}

// ---- Publishing

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/** The cover cut to a link preview, stored in the pictures' folder by its content. */
async function cardFrom(file: string): Promise<string> {
  const { default: sharp } = await import("sharp");
  const data = await sharp(await pictureBytes(file)).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover", position: "attention" })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const name = `${createHash("sha256").update(data).digest("hex").slice(0, 32)}.jpg`;
  await putObject(`${PICTURES}/${name}`, data, "image/jpeg");
  return name;
}

export interface PublishedEdition {
  title: string;
  dek: string;
  description: string;
  html: string;
  wordCount: number;
}

export interface PublishedCover {
  file: string;
  width: number;
  height: number;
  alt: Record<EssayLanguage, string>;
  credit: string | null;
  card: string;
}

/** Publishes both editions as they stand, replacing the live version; the first publication keeps its date. */
export async function publishEssay(id: number, version: number, actor: string): Promise<EssayDetail> {
  const before = await essayRow(sql, id);
  const images = await imageRows(sql, id);
  const cover = images.find((i) => i.slot === "cover");
  const card = cover?.file ? await cardFrom(cover.file) : null;
  await sql.begin(async (tx) => {
    const row = await essayRow(tx, id, true);
    if (row.version !== version || row.version !== before.version) throw new Conflict("这篇文章在别处改过了，刷新后再发布。");
    const current = await imageRows(tx, id);
    if (JSON.stringify(current) !== JSON.stringify(images)) throw new Conflict("图刚刚变了，刷新后再发布。");
    const problems = publishProblems(row, current);
    if (problems.length || !cover?.file || !card) throw new Conflict(`还不能发布：${problems.join(" ")}`);
    const editions = editionsOf(row);
    const published = Object.fromEntries(ESSAY_LANGUAGES.map((language) => {
      const e = editions[language];
      return [language, { title: e.title.trim(), dek: e.dek.trim(), description: e.description.trim(), wordCount: wordCount(e.body, language),
        html: renderBody(e.body, { media: "/essays/media", figures: figuresOf(current, language), language }) } satisfies PublishedEdition];
    }));
    const coverOut: PublishedCover = { file: cover.file, width: cover.width!, height: cover.height!, alt: { en: cover.alt.en!, zh: cover.alt.zh! }, credit: cover.credit, card };
    const files = [...new Set([cover.file, card, ...figureSlots(editions.en.body).map((s) => current.find((i) => i.slot === s)!.file!)])];
    const [first] = await tx<{ at: Date | null }[]>`SELECT min(first_published_at) AS at FROM essay_publications WHERE essay_id = ${id}`;
    await tx`UPDATE essay_publications SET status = 'superseded' WHERE essay_id = ${id} AND status = 'live'`;
    await tx`INSERT INTO essay_publications (essay_id, slug, status, editions, cover, files, first_published_at, published_by)
      VALUES (${id}, ${row.slug}, 'live', ${tx.json(published as never)}, ${tx.json(coverOut as never)}, ${files}, ${first?.at ?? new Date()}, ${actor})`;
    await tx`UPDATE essays SET status = 'published', version = version + 1, updated_at = now() WHERE id = ${id}`;
    await audit(actor, "essay.publish", `essay:${id}`, null, null, { slug: row.slug, version }, { db: tx });
  });
  return essayDetail(id);
}

/** Takes the essay off the site: its pages answer 410 and it leaves the sitemap and feeds. */
export async function withdrawEssay(id: number, version: number, actor: string): Promise<EssayDetail> {
  await sql.begin(async (tx) => {
    const row = await essayRow(tx, id, true);
    if (row.version !== version) throw new Conflict("这篇文章在别处改过了，刷新后再撤下。");
    const done = await tx`UPDATE essay_publications SET status = 'withdrawn' WHERE essay_id = ${id} AND status = 'live'`;
    if (!done.count) throw new Conflict("这篇文章没有在线上。");
    await tx`UPDATE essays SET status = 'withdrawn', version = version + 1, updated_at = now() WHERE id = ${id}`;
    await audit(actor, "essay.withdraw", `essay:${id}`, null, null, { slug: row.slug }, { db: tx });
  });
  return essayDetail(id);
}
