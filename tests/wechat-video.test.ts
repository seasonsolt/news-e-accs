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
import { writeWechatVideoScript } from "@aihot/backend/newsletter/wechat-video";
import { buildApp } from "../apps/api/src/app.ts";
import { subtitles } from "../scripts/wechat-video.ts";

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
    const segments = [
      { n: 1, narration: "Nova 模型发布，推理成本下降一半，用得起的人会更多。" },
      { n: 2, narration: "产品 B 上线，价格降到 199 元。" },
      { n: 3, narration: "行业 C 完成新一轮融资，资金继续流向应用层。" },
    ];
    return { id: `wv-${T}`, choices: [{ message: { content: JSON.stringify({ segments }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
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
    assert.equal(asked.length, 1);
    assert.doesNotMatch(asked[0]!, /行业 C/, "a hidden entry is not spoken");

    const { video } = await ready();
    assert.equal(video?.status, "done");
    const script = video!.script!;
    assert.equal(script.segments.length, 2, "the lead and the other printed entry");
    assert.match(script.opening, /2 条/);
    assert.equal(script.segments[1]!.narration, "产品 B 上线。", "a figure its entry lacks is not spoken: the title is read instead");
    assert.match(script.caption, /^AI 早报｜/);
    assert.match(script.caption, /完整早报：https?:\/\/.+\/daily\//);
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
});
