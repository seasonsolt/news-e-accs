// The 视频号 edition of 「AI 早报」: the workbench asks for a voice-over script, the worker writes one
// paragraph per printed entry with the model (a paragraph that names what its entry does not is read as
// the entry's title instead), the editor rewrites it, and the Mac reads it with the video token, joined
// with the entries as the column prints them now. The model is a local stub.
import { pointModels, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { beijingDate } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { requestWechatVideoScript, saveWechatEdits, saveWechatVideoScript, wechatExport } from "@aihot/backend/admin/wechat";
import { acceptedNarration, acceptedOpening, writeWechatVideoScript } from "@aihot/backend/newsletter/wechat-video";
import { characterErrorRate, forSpeech, stripMarkup } from "@aihot/industry/speech";
import { buildApp } from "../apps/api/src/app.ts";
import { formatSrt, loudnormFilter, parseLoudnorm, subtitles } from "../scripts/wechat-video-speech.ts";

const T = tag();
const TODAY = beijingDate(Date.now());
const TOKEN = `video-token-${T}-0123456789`;
process.env.WECHAT_VIDEO_TOKEN = TOKEN;
const app = await buildApp();

before(async () => {
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${TODAY}`;
  const content = {
    date: TODAY,
    lead: { title: `头条 ${T}`, leadParagraph: "Nova 模型发布，推理成本下降一半。" },
    highlights: [],
    sections: [
      { label: "模型", items: [{ itemId: `wv-${T}-1`, title: "Nova 模型发布", summary: "推理成本下降一半。", sourceName: "官方博客", sourceUrl: "https://example.org/a" }] },
      { label: "产品", items: [{ itemId: `wv-${T}-2`, title: "产品 B 上线", summary: "面向企业开放。", sourceName: "媒体", sourceUrl: "https://example.org/b" }] },
      { label: "行业", items: [{ itemId: `wv-${T}-3`, title: "行业 C 融资", summary: "完成新一轮融资。", sourceName: "媒体", sourceUrl: "https://example.org/c" }] },
    ],
    flashes: [],
    metrics: {},
  };
  await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at)
            VALUES ('daily', ${TODAY}, now() - interval '1 day', now(), ${sql.json(content)}, now())`;
});

after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const ready = async () => {
  const exported = await wechatExport(TODAY);
  assert.equal(exported.status, "ready");
  return exported as Extract<typeof exported, { status: "ready" }>;
};

test("no script is asked for while model calls are off", async () => {
  config.modelCallsEnabled = false;
  try {
    assert.match((await ready()).videoUnavailable ?? "", /MODEL_CALLS_ENABLED/);
    await assert.rejects(requestWechatVideoScript(TODAY, "editor"), /MODEL_CALLS_ENABLED/);
    assert.equal((await ready()).video, null);
  } finally {
    config.modelCallsEnabled = true;
  }
});

test("the worker writes one paragraph per printed entry, the editor rewrites it, and the Mac reads it with the token", async () => {
  const asked: string[] = [];
  const model = await stub((_hit, req) => {
    const user = (JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> }).messages.find((m) => m.role === "user")!.content;
    asked.push(user);
    const read = user.includes("草稿：");
    const segments = read
      ? [
          { n: 1, narration: "Nova 把推理成本降到原来的**一半**[[停]]，用得起的人会更多。" },
          { n: 2, narration: "产品 B 上线，价格降到 199 元。" },
        ]
      : [
          { n: 1, narration: "Nova 模型发布，推理成本下降一半，用得起的人会更多。" },
          { n: 2, narration: "产品 B 上线，价格降到 199 元。" },
        ];
    const opening = read ? "Nova 把推理成本降了一半。" : "早上好。";
    return { id: `wv-${T}`, choices: [{ message: { content: JSON.stringify({ opening, segments }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  try {
    // The editor hides the third entry before asking: the video speaks what the column prints.
    const generated = await ready();
    const third = generated.article.entries[2]!;
    assert.equal(third.title, "行业 C 融资");
    await saveWechatEdits(TODAY, { revision: generated.revision, edits: { hidden: [third.key] } }, "editor");

    const { request } = await requestWechatVideoScript(TODAY, "editor");
    assert.equal((await ready()).video?.status, "queued");
    await assert.rejects(requestWechatVideoScript(TODAY, "editor"), /正在写/, "one script at a time");
    assert.deepEqual(await writeWechatVideoScript({ date: TODAY, request: "an-older-ask" }), { status: "superseded" });
    assert.deepEqual(await writeWechatVideoScript({ date: TODAY, request }), { status: "done" });
    assert.equal(asked.length, 2, "a draft, then a read-aloud pass");
    assert.ok(asked.every((u) => !/行业 C/.test(u)), "a hidden entry is not spoken");
    assert.match(asked[1]!, /草稿：/);
    assert.match(asked[1]!, /用得起的人会更多/, "the read-aloud pass is given the draft");
    assert.doesNotMatch(asked[0]!, /用得起的人会更多/);

    const { video } = await ready();
    assert.equal(video?.status, "done");
    const script = video!.script!;
    assert.equal(script.segments.length, 2, "the lead and the other printed entry");
    assert.equal(script.opening, "Nova 把推理成本降了一半。", "the read-aloud hook replaces the greeting");
    assert.equal(script.segments[0]!.narration, "Nova 把推理成本降到原来的**一半**[[停]]，用得起的人会更多。");
    assert.equal(script.segments[1]!.narration, "产品 B 上线。", "a figure its entry lacks is not spoken: the title is read instead");
    assert.match(script.caption, /^AI 早报｜/);
    assert.match(script.caption, /完整早报：https?:\/\/.+\/daily\//);
    const receipts = await sql<{ status: string; purpose: string }[]>`SELECT status, purpose FROM receipts WHERE purpose = 'wechat_video' ORDER BY id`;
    assert.deepEqual(receipts.map((r) => r.status), ["completed", "completed"], "the draft and the read-aloud pass are both receipted");
    const [receipt] = await sql`SELECT r.status, r.purpose FROM receipts r JOIN wechat_videos v ON v.receipt_id = r.id WHERE v.report_key = ${TODAY}`;
    assert.deepEqual([receipt!.status, receipt!.purpose], ["completed", "wechat_video"], "the script is receipted");

    await saveWechatVideoScript(TODAY, {
      script: { ...script, closing: "明天见。", segments: [{ key: script.segments[1]!.key, narration: "编辑改写的一段。" }, { key: "not-an-entry", narration: "x" }] },
    }, "editor");
    const edited = (await ready()).video!;
    assert.equal(edited.editedBy, "editor");
    assert.equal(edited.script!.segments.length, 2, "the editor rewrites paragraphs but cannot add entries");
    assert.equal(edited.script!.segments[1]!.narration, "编辑改写的一段。");
    assert.equal(edited.script!.segments[0]!.narration, script.segments[0]!.narration, "a paragraph not sent is kept");

    assert.equal((await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}` })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: { authorization: "Bearer wrong-token-0123456789" } })).statusCode, 401);
    const auth = { authorization: `Bearer ${TOKEN}` };
    assert.equal((await app.inject({ method: "GET", url: "/api/wechat-video/2000-01-01", headers: auth })).statusCode, 404);
    const res = await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: auth });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    const spec = res.json();
    assert.equal(spec.opening, "Nova 把推理成本降了一半。");
    assert.equal(spec.closing, "明天见。");
    assert.deepEqual(spec.segments.map((s: { number: number; title: string }) => [s.number, s.title]), [[1, `头条 ${T}`], [2, "产品 B 上线"]]);

    // Hiding an entry after the script was written takes its paragraph out of the video.
    const now = await ready();
    await saveWechatEdits(TODAY, { revision: now.revision, edits: { hidden: [third.key, script.segments[0]!.key] } }, "editor");
    const later = (await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: auth })).json();
    assert.deepEqual(later.segments.map((s: { number: number; title: string }) => [s.number, s.title]), [[1, "产品 B 上线"]]);
  } finally {
    await model.close();
  }
});

test("a spoken line is cut into one-line subtitles at its punctuation, timed by length", () => {
  const subs = subtitles("Nova 模型发布，推理成本下降一半，用得起的人会更多。", 6);
  assert.deepEqual(subs.map((s) => s.text), ["Nova 模型发布", "推理成本下降一半，用得起的人会更多"]);
  assert.ok(Math.abs(subs.reduce((n, s) => n + s.seconds, 0) - 6) < 1e-9);
  assert.ok(subtitles("一".repeat(40), 4).every((s) => Array.from(s.text).length <= 18));
  assert.deepEqual(subtitles("面向公司开放。落地更重要。", 3).map((s) => s.text), ["面向公司开放", "落地更重要"], "a sentence's end starts a new subtitle");
  const marked = "Nova **模型**发布[[停]]，推理成本下降一半。";
  assert.deepEqual(subtitles(marked, 4), subtitles(stripMarkup(marked), 4), "pause and stress marks are not shown");
});

test("a hook has to be one sentence from the lead, and a paragraph keeps marks but not invented figures", () => {
  const lead = { title: "Nova 模型发布", body: "推理成本下降一半。", comment: null };
  const fallback = "早上好，这里是 AI 早报。10 月 15 日，2 条值得关注的 AI 新闻。";
  assert.equal(acceptedOpening("Nova 把推理成本降了一半。", lead), "Nova 把推理成本降了一半。");
  assert.equal(acceptedOpening("Nova 把推理成本降了一半", lead), "Nova 把推理成本降了一半。");
  assert.equal(acceptedOpening("早上好。", lead), null);
  assert.equal(acceptedOpening("AI 早报来了。", { title: "OpenAI 发布", body: "新模型上线。", comment: null }), null, "a generic AI is not the lead");
  assert.equal(acceptedOpening("OpenAI 发布了新模型。", { title: "OpenAI 发布", body: "新模型上线。", comment: null }), "OpenAI 发布了新模型。");
  assert.equal(acceptedOpening("Nova 模型发布。", lead), null, "reading the headline is not an opening");
  assert.equal(acceptedOpening("Nova 发布了。成本也降了。", lead), null, "an opening is one sentence");
  assert.equal(acceptedOpening("成本降到 199 美元。", lead), null);
  assert.equal(acceptedOpening("早上好。", lead) ?? acceptedOpening(undefined, lead) ?? fallback, fallback);

  const product = { title: "产品 B 上线", body: "面向企业开放。", comment: null };
  assert.equal(acceptedNarration("另一边。产品 B 上线，面向企业开放。", product), "另一边。产品 B 上线，面向企业开放。");
  assert.equal(acceptedNarration("产品 B 上线，价格降到 199 元。", product), null);
  const marked = "Nova 把推理成本降到原来的**一半**[[停]]，用得起的人会更多。";
  assert.equal(acceptedNarration(marked, lead), marked, "the stored line keeps the marks the voice consumes");
});

test("the voice lexicon and the transcript check leave the subtitle text alone", () => {
  assert.equal(stripMarkup("调用 **GPT**[[停]]。"), "调用 GPT。");
  assert.equal(forSpeech("调用 **GPT**[[停]]。"), "吊用 [breath]G P T[breath]。");
  assert.equal(forSpeech("Opus 和 GLM、xAI 在一行里重试。"), "欧帕斯 和 G L M、埃克斯 AI 在一航里虫试。");
  assert.equal(characterErrorRate("调用 GPT。", "吊用 吉皮提"), 0);
  assert.equal(characterErrorRate("Opus 和 GLM、xAI 发布。", "欧帕斯 和 G L M、埃克斯AI 发布"), 0);
  assert.ok(characterErrorRate("Nova 模型发布，推理成本下降一半。", "产品 B 上线") > 0.18);
});

test("word times place a subtitle on the pause, and a transcript that does not match falls back to length", () => {
  const line = "Nova 模型发布，推理成本下降一半。";
  const words = [
    { word: "Nova", start: 0.2, end: 0.5 },
    { word: "模型发布", start: 0.5, end: 1.0 },
    { word: "推理成本下降一半", start: 2.0, end: 3.0 },
  ];
  const cues = subtitles(line, 3.2, words);
  assert.equal(cues[0]!.text, "Nova 模型发布");
  assert.ok(cues[0]!.seconds > 1.9, "the first line stays up through the pause");
  assert.ok(Math.abs(cues.reduce((n, c) => n + c.seconds, 0) - 3.2) < 1e-9);
  assert.deepEqual(subtitles(line, 3.2, [{ word: "完全不相干的句子呀", start: 0, end: 3 }]), subtitles(line, 3.2));
  assert.equal(formatSrt([{ text: "Nova 模型发布", start: 0.4, end: 2.1 }]), "1\n00:00:00,400 --> 00:00:02,100\nNova 模型发布\n\n");
});

test("a loudnorm measure becomes the second pass", () => {
  const stderr = `loudnorm\n{\n\t"input_i" : "-27.61",\n\t"input_tp" : "-4.47",\n\t"input_lra" : "5.10",\n\t"input_thresh" : "-38.12",\n\t"output_i" : "-16.00",\n\t"output_tp" : "-1.50",\n\t"output_lra" : "4.20",\n\t"output_thresh" : "-26.50",\n\t"normalization_type" : "dynamic",\n\t"target_offset" : "0.50"\n}\n`;
  const stats = parseLoudnorm(stderr);
  assert.ok(stats);
  assert.equal(loudnormFilter(-16, stats), "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-27.61:measured_LRA=5.1:measured_TP=-4.47:measured_thresh=-38.12:offset=0.5:linear=true");
  assert.equal(loudnormFilter(-16, null), "loudnorm=I=-16:TP=-1.5:LRA=11");
  assert.equal(parseLoudnorm("no json here"), null);
});
