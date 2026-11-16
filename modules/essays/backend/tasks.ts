// The worker's side of the writing desk: one queue, one task at a time, no automatic retries. Text steps
// call chatJson (receipts, budgets, MODEL_CALLS_ENABLED); pictures are found by a web search through the
// Codex CLI and the found pages' preview pictures (as the 公众号 illustrations are), or drawn by the
// Codex CLI's image tool. Every result is written with its receipt, so a restarted task reuses what was
// paid for.
import { z } from "zod";
import { sql, type Db } from "@aihot/backend/db";
import { enqueueOn, recordRun } from "@aihot/backend/jobs/queue";
import { defineQueue } from "@aihot/backend/modules";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { logError } from "@aihot/backend/lib/log-error";
import { chatJson } from "@aihot/backend/providers/llm";
import { codexImage, codexText, saveJpeg } from "@aihot/backend/providers/codex";
import { BudgetExceededError, completeReceipt, paidRequest, ReceiptBusyError, ReceiptUnknownError } from "@aihot/backend/providers/receipts";
import { previews, usablePicture } from "@aihot/backend/newsletter/wechat-illustrations";
import { siteUrl } from "@aihot/backend/publication/links";
import { loadStoryProse, resolveStory } from "@aihot/backend/publication/stories";
import { SITE } from "@aihot/site";
import type { EssayEdition, EssayLanguage, EssayTask, EssayTaskKind } from "../contracts.ts";
import { figureSlots, sections, slugify } from "./render.ts";
import { editionsOf, essayRow, imageRows, PICTURES, pictureBytes, recordRevision, SLOT } from "./store.ts";
import { essayStyle, type LoadedStyle } from "./styles.ts";

export const essayQueue = defineQueue<{ taskId: number }>({
  name: "essays.task",
  // A drawing takes up to eight minutes, a search five plus the downloads.
  options: { retryLimit: 0, expireInSeconds: 1200 },
  worker: { batchSize: 1 },
  run: async (jobs) => { for (const job of jobs) await recordRun("essays.task", () => runEssayTask(job.taskId)); },
});

/** The model step of each text task (server.ts registers them; site/models.ts gives the defaults). */
export const ESSAY_STEPS = { outline: "essayOutline", draft: "essayDraft", revise: "essayRevise", localize: "essayLocalize" } as const;

/** A long essay in one answer: past the default three minutes of a Codex model. */
const WRITE_TIMEOUT_MS = 10 * 60_000;

interface TaskRow {
  id: number;
  essay_id: number;
  kind: EssayTaskKind;
  input: EssayTask["input"];
}

function failure(error: unknown): string {
  if (error instanceof BudgetExceededError) return "预算用完了，稍后再试，或在后台「设置 → 付费请求上限」里调高。";
  if (error instanceof ReceiptBusyError) return "同样的请求正在进行，等它完成。";
  if (error instanceof ReceiptUnknownError) return "中断了（超时或 worker 重启），没有拿到结果，可以重新请求。";
  return String(error instanceof Error ? error.message : error).slice(0, 600);
}

/** Runs one queued task; a task already taken or cleared is left alone. */
export async function runEssayTask(taskId: number): Promise<{ status: string }> {
  const [task] = await sql<TaskRow[]>`UPDATE essay_tasks SET status = 'running', updated_at = now() WHERE id = ${taskId} AND status = 'queued'
    RETURNING id, essay_id, kind, input`;
  if (!task) return { status: "skipped" };
  const essayId = Number(task.essay_id);
  try {
    if (task.kind === "search") await searchPictures(task, essayId);
    else if (task.kind === "draw") await drawPicture(task, essayId);
    else await writeText(task, essayId);
    return { status: "done" };
  } catch (error) {
    console.error("[essays.task]", logError(error));
    await sql`UPDATE essay_tasks SET status = 'failed', error = ${failure(error)}, updated_at = now() WHERE id = ${taskId} AND status = 'running'`;
    // The run is recorded as failed too (admin 运行页); the queue does not retry it.
    throw error;
  }
}

// ---- Text

/** The fragments as numbered notes: a blank line separates two. */
export function numberedFragments(text: string): Array<{ n: number; text: string }> {
  return text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t, i) => ({ n: i + 1, text: t }));
}

const STORY = /^\/(?:zh\/)?story\/([0-9a-f-]{36})\/?$/i;

/** The reference pages as citable material: a public event page brings its title and digest. */
async function referenceMaterial(refs: string[]): Promise<Array<{ address: string; title?: string; summary?: string }>> {
  const origin = new URL(siteUrl("/")).origin;
  return Promise.all(refs.map(async (ref) => {
    let local: string | null = ref.startsWith("/") ? ref : null;
    if (!local) {
      try {
        const url = new URL(ref);
        if (url.origin === origin) local = url.pathname;
      } catch {
        // Kept as given.
      }
    }
    const address = local ? siteUrl(local) : ref;
    const story = local && STORY.exec(local);
    if (story) {
      const found = await resolveStory(story[1]!);
      const prose = found.kind === "found" ? await loadStoryProse(found.storyId) : null;
      if (prose) return { address, title: prose.title, summary: prose.digest || prose.summary || undefined };
    }
    return { address };
  }));
}

async function styleOf(name: string): Promise<LoadedStyle> {
  const style = await essayStyle(name);
  if (!style) throw new Error(`文风 ${name} 不在了，换一个文风再请求。`);
  return style;
}

const OutlineSchema = z.object({
  thesis: z.string().min(1),
  titles: z.array(z.string().min(1)).min(1).max(5),
  sections: z.array(z.object({ heading: z.string().min(1), points: z.array(z.string()), fragments: z.array(z.number().int()).default([]) })).min(1).max(12),
  gaps: z.array(z.string()).default([]),
});

/** The outline as the author edits it. */
export function outlineText(o: z.infer<typeof OutlineSchema>): string {
  return [
    `Thesis: ${o.thesis}`,
    "",
    "Title options:",
    ...o.titles.map((t) => `- ${t}`),
    "",
    ...o.sections.flatMap((s) => [`## ${s.heading}`, ...s.points.map((p) => `- ${p}`), ...(s.fragments.length ? [`(fragments ${s.fragments.join(", ")})`] : []), ""]),
    ...(o.gaps.length ? ["Questions for the author:", ...o.gaps.map((g) => `- ${g}`)] : []),
  ].join("\n").trim();
}

const EditionFields = { title: z.string().min(1).max(300), dek: z.string().min(1).max(1000), description: z.string().min(1).max(400), body: z.string().min(200) };

const DraftSchema = z.object({
  ...EditionFields,
  images: z.array(z.object({ slot: z.string().regex(SLOT), prompt: z.string().min(1).max(4000), alt: z.string().max(500).default("") })).default([]),
}).superRefine((d, ctx) => {
  const slots = new Set(d.images.map((i) => i.slot));
  if (!slots.has("cover")) ctx.addIssue({ code: "custom", message: "images must include the cover" });
  for (const s of figureSlots(d.body)) if (!slots.has(s)) ctx.addIssue({ code: "custom", message: `images must describe ${s}, placed in the body` });
});

const ReviseSchema = z.object({ text: z.string().min(1) });

function localizeSchema(en: EssayEdition, slots: string[]) {
  const figures = figureSlots(en.body).sort().join(",");
  return z.object({ ...EditionFields, body: z.string().min(100), alt: z.record(z.string(), z.string()).default({}) }).superRefine((d, ctx) => {
    if (figureSlots(d.body).sort().join(",") !== figures) ctx.addIssue({ code: "custom", message: `body must keep exactly the figure lines ${figures || "(none)"}` });
    for (const s of slots) if (!d.alt[s]?.trim()) ctx.addIssue({ code: "custom", message: `alt must give the Chinese alt text of ${s}` });
  });
}

async function uniqueSlug(db: Db, id: number, title: string): Promise<string | null> {
  const base = slugify(title);
  if (!base) return null;
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db`SELECT 1 FROM essays WHERE slug = ${slug} AND id <> ${id}`;
    if (!taken) return slug;
  }
  return null;
}

async function writeText(task: TaskRow, essayId: number) {
  const row = await essayRow(sql, essayId);
  const style = await styleOf(row.style);
  const editions = editionsOf(row);
  const kind = task.kind as keyof typeof ESSAY_STEPS;
  const common = { model: await modelFor(ESSAY_STEPS[kind]), purpose: `essay_${kind}`, subject: `essay:${essayId}`, attemptTag: `task:${task.id}`,
    system: promptText(`essay-${kind}`, { style: style.text }), promptVersion: `${promptVersion(`essay-${kind}`, "essay-rules")}:${style.name}:${style.hash}`,
    temperature: 0.7, timeoutMs: kind === "outline" || kind === "revise" ? undefined : WRITE_TIMEOUT_MS };
  const fragments = numberedFragments(row.fragments);
  const references = await referenceMaterial(row.refs);
  const by = { style: style.name, styleHash: style.hash };

  if (kind === "outline") {
    const response = await chatJson({ ...common, schema: OutlineSchema, maxTokens: 6000, user: JSON.stringify({ site: SITE.name, fragments, references }) });
    const text = outlineText(response.data);
    await land(task, response.receiptId, async (tx) => {
      await tx`UPDATE essays SET outline = ${text}, version = version + 1, updated_at = now() WHERE id = ${essayId}`;
      await recordRevision(tx, essayId, "outline", "outline", { text }, "worker", { ...by, receiptId: response.receiptId });
    });
    return;
  }

  if (kind === "draft") {
    const response = await chatJson({ ...common, schema: DraftSchema, maxTokens: 16_000, user: JSON.stringify({ fragments, references, outline: row.outline }) });
    const { images, ...draft } = response.data;
    await land(task, response.receiptId, async (tx) => {
      const current = await essayRow(tx, essayId, true);
      const next = { ...editionsOf(current), en: draft };
      const slug = current.slug.startsWith("essay-draft-") ? await uniqueSlug(tx, essayId, draft.title) : null;
      await tx`UPDATE essays SET editions = ${tx.json(next as never)}, slug = ${slug ?? current.slug}, version = version + 1, updated_at = now() WHERE id = ${essayId}`;
      for (const image of images) {
        await tx`INSERT INTO essay_images (essay_id, slot, prompt, alt) VALUES (${essayId}, ${image.slot}, ${image.prompt}, ${tx.json({ en: image.alt })})
          ON CONFLICT (essay_id, slot) DO UPDATE SET prompt = EXCLUDED.prompt, alt = essay_images.alt || EXCLUDED.alt, updated_at = now()`;
      }
      await recordRevision(tx, essayId, "en", "draft", draft, "worker", { ...by, receiptId: response.receiptId });
    });
    return;
  }

  if (kind === "revise") {
    const language: EssayLanguage = task.input.language === "zh" ? "zh" : "en";
    const base = sections(editions[language].body)[task.input.section!];
    if (base === undefined || !base.trim()) throw new Error("这一节已经不在了，重新请求。");
    const response = await chatJson({ ...common, schema: ReviseSchema, maxTokens: 6000,
      user: JSON.stringify({ language, essay: editions[language], section: base, instruction: task.input.instruction }) });
    await land(task, response.receiptId, async (tx) => {
      await tx`UPDATE essay_tasks SET result = ${tx.json({ text: response.data.text, base })} WHERE id = ${task.id}`;
    });
    return;
  }

  // localize
  const images = await imageRows(sql, essayId);
  const slots = ["cover", ...figureSlots(editions.en.body)].filter((s) => images.some((i) => i.slot === s));
  const response = await chatJson({ ...common, schema: localizeSchema(editions.en, slots), maxTokens: 16_000,
    user: JSON.stringify({ english: editions.en, pictures: slots.map((slot) => ({ slot, alt: images.find((i) => i.slot === slot)!.alt.en ?? "" })) }) });
  const { alt, ...zh } = response.data;
  await land(task, response.receiptId, async (tx) => {
    const current = await essayRow(tx, essayId, true);
    await tx`UPDATE essays SET editions = ${tx.json({ ...editionsOf(current), zh } as never)}, version = version + 1, updated_at = now() WHERE id = ${essayId}`;
    for (const slot of slots) {
      await tx`UPDATE essay_images SET alt = alt || ${tx.json({ zh: alt[slot]! })}, updated_at = now() WHERE essay_id = ${essayId} AND slot = ${slot}`;
    }
    await recordRevision(tx, essayId, "zh", "localize", zh, "worker", { ...by, receiptId: response.receiptId });
  });
}

/** Writes a finished task's result with its receipt, unless the task was cleared meanwhile. */
async function land(task: TaskRow, receiptId: number | null, write: (tx: Db) => Promise<void>) {
  await sql.begin(async (tx) => {
    if (receiptId !== null) await completeReceipt(tx, receiptId);
    const [mine] = await tx`SELECT 1 FROM essay_tasks WHERE id = ${task.id} AND status = 'running' FOR UPDATE`;
    if (!mine) return;
    await write(tx);
    await tx`UPDATE essay_tasks SET status = 'done', receipt_id = ${receiptId}, error = NULL, updated_at = now() WHERE id = ${task.id}`;
  });
}

// ---- Pictures

/** Candidates offered for a slot; each is one download. */
const CANDIDATES = 4;
const PagesSchema = z.object({ pages: z.array(z.string()) });

async function slotPrompt(essayId: number, slot: string): Promise<string> {
  const [image] = await sql<{ prompt: string }[]>`SELECT prompt FROM essay_images WHERE essay_id = ${essayId} AND slot = ${slot}`;
  if (!image?.prompt.trim()) throw new Error("这个图位没有描述了，写好描述再请求。");
  return image.prompt;
}

async function searchPictures(task: TaskRow, essayId: number) {
  const slot = task.input.slot!;
  const prompt = promptText("essay-image-search", { subject: await slotPrompt(essayId, slot) });
  const receipt = await paidRequest(
    { service: "codex-text", model: null, purpose: "essay_image_search", subject: `essay:${essayId}:${slot}`, identity: { prompt }, attemptTag: `task:${task.id}`, requestSummary: { chars: prompt.length } },
    async () => ({ response: { text: (await codexText({ prompt, timeoutMs: 5 * 60_000, webSearch: true })).text } }),
  );
  const text = String((receipt.response as { text?: unknown } | null)?.text ?? "");
  let pages: string[] = [];
  try {
    pages = PagesSchema.parse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")).pages.filter((p) => /^https?:\/\//.test(p));
  } catch {
    // An answer that is not the asked JSON found nothing usable.
  }
  const found: Array<{ file: string; page: string }> = [];
  for (const candidate of await previews(pages)) {
    if (found.length >= CANDIDATES) break;
    const picture = await usablePicture(candidate.url);
    if (!picture) continue;
    const saved = await saveJpeg(picture, PICTURES);
    if (!found.some((f) => f.file === saved.file)) found.push({ file: saved.file, page: candidate.page });
  }
  await land(task, receipt.receiptId, async (tx) => {
    await tx`UPDATE essay_images SET candidates = ${tx.json(found)}, updated_at = now() WHERE essay_id = ${essayId} AND slot = ${slot}`;
    await tx`UPDATE essay_tasks SET result = ${tx.json({ found: found.length })} WHERE id = ${task.id}`;
  });
}

async function drawPicture(task: TaskRow, essayId: number) {
  const slot = task.input.slot!;
  const drawn = await codexImage({ instruction: promptText("essay-art", { subject: await slotPrompt(essayId, slot) }), folder: PICTURES,
    purpose: "essay_image", subject: `essay:${essayId}:${slot}`, attemptTag: `task:${task.id}` });
  const { default: sharp } = await import("sharp");
  const meta = await sharp(await pictureBytes(drawn.file)).metadata();
  await land(task, drawn.receiptId, async (tx) => {
    await tx`UPDATE essay_images SET file = ${drawn.file}, width = ${meta.width ?? 0}, height = ${meta.height ?? 0}, origin = 'drawn', credit = NULL, updated_at = now()
      WHERE essay_id = ${essayId} AND slot = ${slot}`;
  });
}

/** Queued with the request's own transaction, so a refused request leaves no job behind. */
export async function enqueueEssayTask(taskId: number, tx: Db) {
  return enqueueOn(essayQueue, { taskId }, {}, tx);
}
