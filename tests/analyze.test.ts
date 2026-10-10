// The judging and writing steps (editorial/analyze.ts): the prefilter decides relevance, two scores
// against the tier threshold decide 精选, selected and near-selected items are written by the content
// understanding and the rest by the title/summary translation, a structure step gives the category,
// subjects and fact. Material with only a feed summary has its page fetched first.
import { pointModels, Reply, stub, tag } from "./setup.ts";
import { analysisStep, type AnalysisStep } from "./analysis-steps.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle, buildMaterial, loadAnalyzeInput, normalizeStructure, StructureSchema, tierThreshold, UNDERSTAND_FLOOR } from "@aihot/backend/editorial/analyze";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { compactAnswerFirstSummary, enforceIdentity, MAX_BODY_CHARS, parseWritingOutput } from "@aihot/backend/editorial/writing";
import { READER_WORDING } from "@aihot/industry/wording";
import { ITEM_TYPES } from "@aihot/industry/taxonomy";

const T = tag();
const SOURCE = `test-analyze-${T}`;
const X_SOURCE = `test-analyze-x-${T}`;

interface Req { step: AnalysisStep; marker: string; user: string }
const requests: Req[] = [];
const MARKERS = ["CLEAR", "RESCUE", "LOW", "OFFTOPIC", "BARE", "VAGUE", "THIN", "SENSITIVE", "POST", "WORDY", "REFUSAL", "RENUMBER", "UNMENDED"];
// The scores sit a few points around the pack's T1 threshold and understand floor, so each case means
// the same after a site recalibrates them: selected when the two add up to 2 × T1, written like a
// selected item when they add up to more than 2 × FLOOR, translated otherwise.
const T1 = tierThreshold("T1")!;
const FLOOR = UNDERSTAND_FLOOR;
const scoreAnswers: Record<string, number[]> = {
  CLEAR: [T1 + 3, T1 - 1], RESCUE: [FLOOR + 1, FLOOR], LOW: [FLOOR, FLOOR - 1], THIN: [T1, T1], SENSITIVE: [T1, T1], POST: [FLOOR, FLOOR],
  BARE: [FLOOR - 2, FLOOR - 4], VAGUE: [T1, T1 + 2], WORDY: [T1, T1], REFUSAL: [T1, T1], RENUMBER: [T1, T1], UNMENDED: [T1, T1],
};

const WORDY = ["WORDY", "REFUSAL", "RENUMBER", "UNMENDED"];

// One stub stands in for DashScope (prefilter, structure), Zhipu (score, understand) and DeepSeek (summarize).
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> };
  const last = body.messages[body.messages.length - 1]!.content;
  const user = typeof last === "string" ? last : JSON.stringify(last);
  const step = analysisStep(req.body);
  const marker = MARKERS.find((m) => user.includes(m)) ?? "";
  requests.push({ step, marker, user });
  const answer = (content: unknown) => ({ id: `stub-${requests.length}`, model: "stub", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  if (step === "prefilter") return answer({ label: marker === "OFFTOPIC" || marker === "BARE" ? "BLOCK" : marker === "VAGUE" ? "UNKNOWN" : "PASS", reason: "测试" });
  if (step === "score") return answer({ attentionScore: scoreAnswers[marker]!.shift() });
  // Copy with a word a site keeps from readers (added to the pack's list below), and its mended form: whole (WORDY),
  // refused by the provider, with a number changed, or with as many such words as before.
  if (step === "understand" && WORDY.includes(marker)) return answer({ itemType: ITEM_TYPES[0], authorRole: "principal", tags: [], editorialJudgment: `The reason has a forbidden word ${marker}`, title: `The headline has a forbidden word ${marker}`, summary: `${marker} summary. The second sentence adds 3 figures.` });
  if (step === "wording" && marker === "REFUSAL") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系统检测到输入或生成内容可能包含不安全或敏感内容" } });
  if (step === "wording") {
    const unmended = marker === "UNMENDED" ? "a forbidden word" : "a changed phrase";
    return answer({ title: `The headline has ${unmended} ${marker}`, summary: `${marker} summary. The second sentence adds ${marker === "RENUMBER" ? 4 : 3} figures.`, reason: `The reason has ${unmended} ${marker}` });
  }
  if (step === "understand") {
    if (marker === "SENSITIVE") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系统检测到输入或生成内容可能包含不安全或敏感内容" } });
    return answer({ itemType: "model_release", authorRole: "principal", tags: ["模型发布", "开源", "Agent", "不存在的标签"], editorialJudgment: `Useful detail ${marker}`, title: `Understood headline ${marker}`, summary: `The lab released a model ${marker}. Pricing and benchmark details are available.` });
  }
  if (step === "structure") return answer({ category: "ai-models", tags: ["模型发布", "推理"], subjects: ["anthropic", "unknown-co"], scope: "single", fact: { title: `Fact headline ${marker}`, subject: "某公司", action: "发布", object: "模型", occurredAt: null, evidence: "a lab released a model", conditions: [] } });
  return answer(`title: English headline ${marker}\nsummary: The lab released a model ${marker}. Access terms are available.`);
});
pointModels(provider.url);

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${SOURCE}, 'Test analyze source', 'rss', 'T1', 'editorial', '2100-01-01'),
    (${X_SOURCE}, 'Test X account', 'x_search', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

// The tag keeps each material unique: identical input would reuse an earlier run's paid answers.
const LONG = "a lab released a model with a benchmark table and pricing details. ".repeat(8);
const article = async (marker: string, extra: Record<string, unknown> = {}) =>
  (await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${marker}-${T}`, title: `${marker} model release ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"), ...extra,
  } as never)).articleId;
const calls = (marker: string) => requests.filter((r) => r.marker === marker).map((r) => r.step);
const row = async (id: string) =>
  (await sql<{ selected: boolean; relevance: string; score: string | null; title: string; reason: string | null; category: string | null; tags: string[]; subjects: string[]; receipt_ids: string[]; output: Record<string, any> }[]>`
    SELECT selected, relevance, score, title, reason, category, tags, subjects, receipt_ids, output FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`)[0]!;

test("a selected item: prefilter, two scores, the content understanding and the structure", async () => {
  assert.ok(FLOOR >= 4 && FLOOR < T1 && T1 <= 97, "the cases need the understand floor below the T1 threshold, and a few points either side");
  const id = await article("CLEAR");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, T1 + 1], `${T1 + 3} + ${T1 - 1} >= 2 × ${T1}; the mean is shown`);
  assert.deepEqual(calls("CLEAR").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title, r.reason, r.category, r.receipt_ids.length], ["Understood headline CLEAR", "Useful detail CLEAR", "ai-models", 5]);
  // Failure case: the writer's independent labels contradict the structural category.
  assert.deepEqual(r.tags, ["模型发布", "推理", "Anthropic"], "category and tags come from the same structural judgement, plus the verified subject tag");
  assert.deepEqual(r.subjects, ["anthropic"]);
  assert.deepEqual([r.output.writer, r.output.itemType, r.output.prefilter.label, r.output.fact.title], ["understand", "model_release", "PASS", "Fact headline CLEAR"]);
  assert.equal(r.output.scope, "single");
  assert.equal(r.output.fact.evidence, "a lab released a model");
  const score = requests.find((q) => q.marker === "CLEAR" && q.step === "score")!;
  assert.match(score.user, /【标题】\nCLEAR model release/, "the score reads the original title, before any writing");
});

test("a word the site keeps from readers goes back once to be changed; copy without one is not sent", async () => {
  // A word only this test bans: the pack's list is the site's own (empty in the template).
  (READER_WORDING as Array<readonly [RegExp, string]>).push([/forbidden word/iu, "use another phrase"]);
  try {
    const id = await article("WORDY");
    await analyzeArticle(id);
    assert.equal(calls("WORDY").filter((s) => s === "wording").length, 1);
    const r = await row(id);
    assert.deepEqual([r.title, r.reason], ["The headline has a changed phrase WORDY", "The reason has a changed phrase WORDY"], "the mended copy is stored");
    const sent = requests.find((q) => q.marker === "WORDY" && q.step === "wording")!;
    assert.ok(sent.user.includes('The title uses "forbidden word"') && sent.user.includes('The reason uses "forbidden word"'), "each use named");
    assert.ok(!requests.some((q) => q.step === "wording" && q.marker !== "WORDY"), "the other items' copy uses none");
  } finally {
    (READER_WORDING as Array<readonly [RegExp, string]>).pop();
  }
});

test("the first copy stands when the provider refuses the mend, the mend changes a number or leaves as many such words", async () => {
  (READER_WORDING as Array<readonly [RegExp, string]>).push([/forbidden word/iu, "use another phrase"]);
  try {
    for (const marker of ["REFUSAL", "RENUMBER", "UNMENDED"]) {
      const id = await article(marker);
      await analyzeArticle(id);
      const r = await row(id);
      assert.deepEqual([r.title, r.reason], [`The headline has a forbidden word ${marker}`, `The reason has a forbidden word ${marker}`], `${marker}: the first copy is stored`);
      assert.equal(calls(marker).filter((s) => s === "wording").length, 1, `${marker}: mended once`);
      const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE purpose = 'mend_wording' AND subject LIKE ${`article:${id}@%`}`;
      assert.equal(receipt!.status, marker === "REFUSAL" ? "failed" : "completed", `${marker}: the mend's receipt`);
    }
  } finally {
    (READER_WORDING as Array<readonly [RegExp, string]>).pop();
  }
});

test("structure retains grounded conditions, rejects invented or unseen quotes, and does not infer missing scope", async () => {
  const input = (await loadAnalyzeInput(await article("CONDITIONS", {
    bodyText: "Preview is free for Pro users until October 10.\n" + "x".repeat(11000) + "\nOnly available in the US. " + "x".repeat(MAX_BODY_CHARS) + "This late detail was not sent.",
  })))!;
  input.translationZh = "仅中文译文中出现的限制";
  const frame = { title: "Preview launches", evidence: "Preview is free for Pro users until October 10.", conditions: [
    { text: "Pro users only, free until October 10", quote: "Preview is free for Pro users until October 10." },
    { text: "US only", quote: "Only available in the US." },
    { text: "Unlimited free", quote: "Unlimited free access for everyone." },
    { text: "Sentence outside the model input", quote: "This late detail was not sent." },
  ] };
  const base = { category: "ai-models", tags: [], subjects: [], fact: frame };
  const out = normalizeStructure(StructureSchema.parse(base), input);
  assert.ok(buildMaterial(input).includes("Only available in the US."), "a condition after the old 7000-character cutoff reaches the model");
  assert.ok(buildMaterial(input).includes("后文未提供"));
  assert.equal(out.scope, "unknown", "an older result with a fact is not proof of single scope");
  assert.deepEqual(out.fact?.conditions, frame.conditions.slice(0, 2));
  assert.equal(out.fact?.evidence, frame.evidence);
  const partial = normalizeStructure(StructureSchema.parse({ ...base, fact: { ...frame, conditions: [
    { quote: "x".repeat(401) },
    { quote: "Preview is free... until October 10." },
    { quote: "Only available in the US." },
  ] } }), input);
  assert.deepEqual(partial.fact?.conditions, [{ text: "Only available in the US.", quote: "Only available in the US." }],
    "an invalid sibling cannot discard a valid original condition; spliced quotes remain rejected");
  const invented = normalizeStructure(StructureSchema.parse({ ...base, fact: { ...frame, evidence: input.source.name, conditions: [{ text: "Translation limit", quote: input.translationZh }] } }), input);
  assert.equal(invented.fact?.evidence, null, "source metadata is not original evidence");
  assert.deepEqual(invented.fact?.conditions, [], "a translation does not count as an original quote");
  assert.equal(normalizeStructure(StructureSchema.parse({ ...base, scope: "composite" }), input).fact, null, "composite output cannot also claim one fact");
  const titleOnly = normalizeStructure(StructureSchema.parse({ ...base, scope: "single" }), { ...input, bodyText: null, excerpt: null });
  assert.equal(titleOnly.scope, "unknown", "a confident model cannot supply the missing original material");
  assert.equal(titleOnly.fact, null);
});

test("a near-selected item is written like a selected one; below the floor it is translated", async () => {
  const near = await analyzeArticle(await article("RESCUE"));
  assert.deepEqual([near!.output!.selected, near!.output!.reason], [false, "Useful detail RESCUE"], `${FLOOR + 1} + ${FLOOR} > 2 × ${FLOOR}`);
  const lowId = await article("LOW");
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.title, low!.output!.reason], [false, "English headline LOW", null]);
  assert.deepEqual(calls("LOW").sort(), ["prefilter", "score", "score", "structure", "summarize"]);
  assert.deepEqual((await row(lowId)).tags, ["模型发布", "推理", "Anthropic"], "structure tags");
});

test("the prefilter's BLOCK stops everything; UNKNOWN with material goes on like PASS", async () => {
  const off = await analyzeArticle(await article("OFFTOPIC"));
  assert.deepEqual([off!.output!.relevance, off!.output!.selected], ["block", false]);
  assert.deepEqual(calls("OFFTOPIC"), ["prefilter"]);
  // An UNKNOWN with material is judged and written like a PASS, up to 精选 (T1 + T1 + 2 ≥ 2 × T1).
  const vagueId = await article("VAGUE");
  const vague = await analyzeArticle(vagueId);
  assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, vague!.output!.title], ["pass", true, "Understood headline VAGUE"]);
  assert.equal((await row(vagueId)).output.prefilter.label, "UNKNOWN", "the prefilter's own answer stays on record");
  // Nothing but a title and no page to fetch: the BLOCK counts as UNKNOWN and waits for material.
  const bare = await analyzeArticle(await article("BARE", { bodyText: null, excerpt: null, bodyStatus: "none" }));
  assert.deepEqual([bare!.output!.relevance, bare!.output!.selected, bare!.output!.score], ["unknown", false, null]);
  assert.deepEqual(calls("BARE"), ["prefilter"]);
});

test("a feed summary alone: the article page is fetched first, then the whole article is judged", async () => {
  const id = await article("THIN", { bodyText: null, bodyStatus: "pending", excerpt: `THIN: a short feed summary (${T}).` });
  // The queue sends it to extraction although its source does not ask for full text (the sweep does
  // the same after a failed fetch, so extraction failures add up to "unconfirmed" and end).
  await queueProcessing(id);
  const [job] = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${id}`;
  assert.equal(job?.name, QUEUES.extractBody);
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.needsBody, first!.output], [true, null]);
  assert.deepEqual(calls("THIN"), [], "no model call before the page");
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id = ${id}`).length, 0, "nothing committed");
  // What extraction does: the body lands as a new revision.
  await sql`UPDATE articles SET body_text = ${`THIN: ${LONG} (${T}) full page`}, body_status = 'ok', revision = revision + 1 WHERE id = ${id}`;
  const second = await analyzeArticle(id);
  assert.deepEqual([second!.needsBody ?? false, second!.output!.selected], [false, true]);
});

test("a known English short post is its own copy; a content-filter refusal falls back to English writing", async () => {
  // The tag rides as a hashtag, which the language check strips.
  const text = `POST: I connected the agent to my workflow today. #t${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/1${Date.now()}`, title: text, language: "en", via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "测试", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.deepEqual([post!.output!.title, post!.output!.summary], [text, text]);
  assert.ok(!calls("POST").includes("summarize"), "no translation call");
  const sensitive = await analyzeArticle(await article("SENSITIVE"));
  assert.deepEqual([sensitive!.output!.selected, sensitive!.output!.title], [true, "English headline SENSITIVE"]);
  assert.deepEqual(calls("SENSITIVE").filter((s) => s === "understand" || s === "summarize"), ["understand", "summarize"]);
});

test("guards: a company the input does not name is not written in; long summaries are cut at sentences", () => {
  const input = { title: "A lab releases a model", text: "A lab releases a model with parameter and price details.", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { title: "OpenAI releases a model", summary: "A lab releases a model." });
  assert.deepEqual([guarded.title, guarded.summary, guarded.identityGuard.outcome], ["A lab releases a model", "A lab releases a model.", "fallback"]);
  // The identity lexicon: a Chinese rendering of a company the input names in English is no invention.
  const alibaba = { title: "Alibaba ships a new coding model", text: "Alibaba released a coding model with pricing details.", sourceKind: "rss" };
  assert.equal(enforceIdentity(alibaba, { title: "阿里巴巴发布编程模型", summary: "阿里巴巴发布了编程模型并公布价格。" }).identityGuard.outcome, "pass");
  const long = "A lab released a new model with public benchmark and pricing details. ".repeat(20);
  assert.ok(compactAnswerFirstSummary(long).length <= 800);
  assert.deepEqual(parseWritingOutput("title: 标题\nsummary: 第一句。\n第二句。"), { title: "标题", summary: "第一句。\n第二句。", body: "" });
  assert.equal(parseWritingOutput("title: 标题\nbody: 我们懂你。\n\n来源：X：PixVerse (@PixVerse)").body, "我们懂你。", "a repeated prompt line is dropped");
});

test("analysing the same revision again reuses every paid answer", async () => {
  scoreAnswers.CLEAR = [T1 + 2, T1];
  const id = await article("CLEAR", { url: `https://example.com/CLEAR-again-${T}`, title: `CLEAR model release again ${T}` });
  const first = await analyzeArticle(id);
  assert.equal(first!.reused, false);
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "no new requests");
  assert.deepEqual([again!.reused, again!.receiptIds], [true, first!.receiptIds]);
});
