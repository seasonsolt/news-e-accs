// The 视频号 edition of 「AI 早报」: the workbench asks for a voice-over script, the worker writes the lead,
// the quick hits and a last word with the model (a paragraph that names what its entry does not is read as
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
import { writeWechatVideoScript, type WechatVideoSpec } from "@aihot/backend/newsletter/wechat-video";
import { buildApp } from "../apps/api/src/app.ts";
import { charTimes, misheard, subtitles } from "../scripts/wechat-video.ts";
import { composition, tokens } from "../scripts/wechat-video-composition.ts";

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
      { label: "其他", items: ["D", "E", "F", "G"].map((x) => ({ itemId: `wv-${T}-${x}`, title: `条目 ${x} 发布`, summary: "细节见原文。", sourceName: "媒体", sourceUrl: `https://example.org/${x}` })) },
      { label: "趣闻", items: [{ itemId: `wv-${T}-h`, title: "插件 H 上线", summary: "支持中文。", sourceName: "媒体", sourceUrl: "https://example.org/h" }] },
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

test("the worker writes the lead, the quick hits and a last word, the editor rewrites them, and the Mac reads them with the token", async () => {
  const asked: string[] = [];
  const model = await stub((hit, req) => {
    const user = (JSON.parse(req.body) as { messages: Array<{ role: string; content: string }> }).messages.find((m) => m.role === "user")!.content;
    asked.push(user);
    const segments = [
      { n: 1, narration: "Nova 模型发布，推理成本下降一半，用得起的人会更多。", points: ["推理成本下降一半", "售价 199 元", "用得起的人更多。"] },
      { n: 2, narration: "产品 B 上线，价格降到 199 元。" },
    ];
    // The second time the model jokes about a story the video tells.
    const egg = hit === 1 ? { n: 7, line: "插件 H 终于上线，等的人可以去吃早饭了。" } : { n: 2, line: "条目 D 终于发布，等的人可以去吃早饭了。" };
    return { id: `wv-${T}`, choices: [{ message: { content: JSON.stringify({ segments, egg }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
  });
  pointModels(model.url, ["deepseek-flash"]);
  try {
    // The editor hides the third entry before asking: the video speaks what the column prints.
    const generated = await ready();
    const third = generated.article.entries[2]!;
    assert.equal(third.title, "行业 C 融资");
    const last = generated.article.entries[7]!;
    assert.equal(last.title, "插件 H 上线");
    await saveWechatEdits(TODAY, { revision: generated.revision, edits: { hidden: [third.key] } }, "editor");

    const { request } = await requestWechatVideoScript(TODAY, "editor");
    assert.equal((await ready()).video?.status, "queued");
    await assert.rejects(requestWechatVideoScript(TODAY, "editor"), /正在写/, "one script at a time");
    assert.deepEqual(await writeWechatVideoScript({ date: TODAY, request: "an-older-ask" }), { status: "superseded" });
    assert.deepEqual(await writeWechatVideoScript({ date: TODAY, request }), { status: "done" });
    assert.equal(asked.length, 1);
    assert.doesNotMatch(asked[0]!, /行业 C/, "a hidden entry is not spoken");
    assert.match(asked[0]!, /^视频里的条目（1 是重点，其余是快讯）/);
    assert.match(asked[0]!, /彩蛋候选：[^]*插件 H/, "the entries after the video's are offered for the last word");

    const { video } = await ready();
    assert.equal(video?.status, "done");
    const script = video!.script!;
    assert.equal(script.segments.length, 6, "the lead and five quick hits");
    assert.match(script.opening, /重点说一件事，再快速过 5 条消息/);
    assert.deepEqual(script.segments[0]!.points, ["推理成本下降一半", "用得起的人更多"], "a point naming what its entry lacks is dropped");
    assert.equal(script.segments[1]!.narration, "产品 B 上线。", "a figure its entry lacks is not spoken: the title is read instead");
    assert.deepEqual(script.egg, { key: last.key, narration: "最后来个彩蛋。插件 H 终于上线，等的人可以去吃早饭了。" });
    assert.match(script.caption, /^AI 早报｜/);
    assert.match(script.caption, /完整早报：https?:\/\/.+\/daily\//);
    const [receipt] = await sql`SELECT r.status, r.purpose FROM receipts r JOIN wechat_videos v ON v.receipt_id = r.id WHERE v.report_key = ${TODAY}`;
    assert.deepEqual([receipt!.status, receipt!.purpose], ["completed", "wechat_video"], "the script is receipted");

    await saveWechatVideoScript(TODAY, {
      script: { ...script, closing: "明天见。", segments: [{ key: script.segments[1]!.key, narration: "编辑改写的一段。" }, { key: "not-an-entry", narration: "x" }], egg: { key: "not-an-entry", narration: "编辑改写的彩蛋。" } },
    }, "editor");
    const edited = (await ready()).video!;
    assert.equal(edited.editedBy, "editor");
    assert.equal(edited.script!.segments.length, 6, "the editor rewrites paragraphs but cannot add entries");
    assert.equal(edited.script!.segments[1]!.narration, "编辑改写的一段。");
    assert.equal(edited.script!.segments[0]!.narration, script.segments[0]!.narration, "a paragraph not sent is kept");
    assert.deepEqual(edited.script!.egg, { key: last.key, narration: "编辑改写的彩蛋。" }, "the last word keeps its entry");
    await assert.rejects(saveWechatVideoScript(TODAY, { script: { ...edited.script, segments: [{ key: script.segments[0]!.key, narration: "x", points: ["a", "b", "c", "d"] }] } }, "editor"), /at most 3/);

    assert.equal((await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}` })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: { authorization: "Bearer wrong-token-0123456789" } })).statusCode, 401);
    const auth = { authorization: `Bearer ${TOKEN}` };
    assert.equal((await app.inject({ method: "GET", url: "/api/wechat-video/2000-01-01", headers: auth })).statusCode, 404);
    const res = await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: auth });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["cache-control"], "no-store");
    const spec = res.json();
    assert.equal(spec.closing, "明天见。");
    assert.equal(spec.site, new URL(config.siteUrl).host, "the closing card names the site");
    assert.deepEqual(spec.segments.map((s: { number: number; title: string }) => [s.number, s.title]),
      [[1, `头条 ${T}`], [2, "产品 B 上线"], [3, "条目 D 发布"], [4, "条目 E 发布"], [5, "条目 F 发布"], [6, "条目 G 发布"]]);
    assert.deepEqual(spec.segments.map((s: { points: string[] }) => s.points), [["推理成本下降一半", "用得起的人更多"], [], [], [], [], []], "only the lead shows points");
    assert.equal(spec.egg.title, "插件 H 上线");
    assert.equal(spec.egg.narration, "编辑改写的彩蛋。");

    await saveWechatVideoScript(TODAY, { script: { ...(await ready()).video!.script, egg: null } }, "editor");
    assert.equal((await ready()).video!.script!.egg, null, "the editor may drop the last word");
    assert.equal((await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: auth })).json().egg, null);

    // Hiding an entry after the script was written takes its paragraph out of the video.
    const now = await ready();
    await saveWechatEdits(TODAY, { revision: now.revision, edits: { hidden: [third.key, script.segments[0]!.key] } }, "editor");
    const later = (await app.inject({ method: "GET", url: `/api/wechat-video/${TODAY}`, headers: auth })).json();
    assert.deepEqual(later.segments.map((s: { number: number; title: string }) => s.title), ["产品 B 上线", "条目 D 发布", "条目 E 发布", "条目 F 发布", "条目 G 发布"]);

    // Asked again, the model's last word is on a story the video tells: there is none.
    const again = await requestWechatVideoScript(TODAY, "editor");
    assert.deepEqual(await writeWechatVideoScript({ date: TODAY, request: again.request }), { status: "done" });
    assert.equal((await ready()).video!.script!.egg, null);
  } finally {
    await model.close();
  }
});

test("a spoken line is cut into one-line subtitles at its punctuation, each where it starts in the line", () => {
  const line = "Nova 模型发布，推理成本下降一半，用得起的人会更多。";
  const subs = subtitles(line);
  assert.deepEqual(subs.map((s) => s.text), ["Nova 模型发布", "推理成本下降一半", "用得起的人会更多"]);
  for (const s of subs) assert.equal(Array.from(line).slice(s.from, s.from + Array.from(s.text).length).join(""), s.text);
  assert.ok(subtitles("一".repeat(40)).every((s) => Array.from(s.text).length <= 16));
  assert.deepEqual(subtitles("面向公司开放。落地更重要。").map((s) => s.text), ["面向公司开放", "落地更重要"], "a sentence's end starts a new subtitle");
  assert.deepEqual(subtitles("这里是 AI 早报。10 月 15 日。").map((s) => s.text), ["这里是 AI 早报", "10 月 15 日"]);
  assert.deepEqual(subtitles("Google 推出 Deep Review，专门审读复杂文档。").map((s) => s.text), ["Google 推出 Deep Review", "专门审读复杂文档"], "letters set narrower than characters");
  const long = "这是一个很长很长的句子里面有 Character.AI 这个名字出现";
  assert.deepEqual(subtitles(long).map((s) => s.text), ["这是一个很长很长的句子里面有", "Character.AI 这个名字出现"], "a long phrase is cut in even pieces, not inside a name");
  assert.deepEqual(subtitles(long).map((s) => s.from), [0, 15]);
  assert.deepEqual(subtitles("成功率从 71.8% 提到 83%。").map((s) => s.text), ["成功率从 71.8% 提到 83%"], "a dot inside a number does not cut");
});

test("each character is timed by the aligner's words, and the ones it skips between them", () => {
  // Punctuation and spaces are not words; a name may come split; a word the text lacks is skipped.
  const words: Array<[string, number, number]> = [["Character", 0, 0.4], ["AI", 0.5, 0.7], ["破", 0.7, 0.9], ["产", 0.9, 1.1], ["嗯", 1.1, 1.2], ["了", 1.4, 1.6]];
  const { at, found } = charTimes("Character.AI 破产了。", words, 2);
  assert.equal(at.length, 17);
  assert.equal(at[0], 0);
  assert.equal(at[10], 0.5, "AI after the dot");
  assert.ok(at[9]! > at[8]! && at[9]! < at[10]!, "the dot falls between its neighbours");
  assert.equal(at[13], 0.7);
  assert.equal(at[15], 1.4);
  assert.ok(at[16]! > 1.4 && at[16]! <= 2, "the full stop after the last word runs to the line's end");
  assert.equal(found, 5 / 6);
  assert.deepEqual(charTimes("你好", [], 1).at, [1 / 3, 2 / 3], "with nothing aligned, the line is spread evenly");
});

test("the hearing check names what the voice model read wrong", () => {
  assert.deepEqual(misheard("Google 扩大 Earth AI 的访问范围。", "谷歌扩大 2C AI 的访问范围。"), ["没听出「Earth」"], "Google written as 谷歌 was heard");
  assert.deepEqual(misheard("成功率提到 83%，Character.AI 也一样。", "成功率提到百分之八十三，Character AI 也一样"), [], "numbers are read in words, a dot is not said");
  assert.match(misheard("训练成本下降一半", "训练时间下降了").join(), /汉字只对上/);
});

test("the composition has the lead's card, one card of quick hits, the last word's card and a clip per subtitle, its text escaped", () => {
  const spec: WechatVideoSpec = {
    date: "2026-10-15", issueNumber: 22, theme: "amber", site: "e-acc.ai", opening: "早上好。", closing: "明天见。", caption: "",
    segments: [
      { key: "a", number: 1, section: "模型", sourceName: "官方博客", title: "A <模型> 发布", narration: "A 模型发布。成本减半。", points: ["成本减半", "用得起"], hasImage: true },
      { key: "b", number: 2, section: "产品", sourceName: "媒体", title: "产品 B 上线", narration: "产品 B 上线。", points: [], hasImage: false },
      { key: "c", number: 3, section: "行业", sourceName: "媒体", title: "行业 C 融资", narration: "行业 C 融资。", points: [], hasImage: true },
    ],
    egg: { key: "b", section: "产品", sourceName: "媒体", title: "产品 B 上线", narration: "最后来个彩蛋。等了好久。", hasImage: false },
  };
  const html = composition({
    spec, duration: 20,
    scenes: [{ start: 0, end: 3 }, { start: 3, end: 9 }, { start: 9, end: 14 }, { start: 14, end: 17 }, { start: 17, end: 20 }],
    points: [3.5, 6], briefs: [{ start: 9.5, end: 11.5 }, { start: 11.5, end: 13.5 }],
    subtitles: [{ start: 1.8, end: 2.6, tokens: tokens("早上好").map((text, k) => ({ text, at: 1.8 + k * 0.2 })) }],
    images: { a: "images/01.jpg", c: "images/03.jpg" },
  }, "fonts");
  assert.deepEqual([...html.matchAll(/class="clip scene (\w+)"/g)].map((m) => m[1]), ["opening", "lead", "briefs", "egg", "closing"]);
  assert.equal(html.match(/class="clip sub"/g)?.length, 1);
  assert.equal(html.match(/<ul class="points"><li>成本减半<\/li><li>用得起<\/li><\/ul>/g)?.length, 1, "the lead's points");
  assert.equal(html.match(/class="briefs"/g)?.length, 1);
  assert.match(html, /<h1 class="hero"[^>]*>A &lt;模型&gt; 发布<\/h1>/, "the first frame is the lead's title");
  assert.match(html, /<div class="rest">还有 2 条快讯 · 彩蛋最后见<\/div>/, "and promises the rest");
  assert.match(html, /data-duration="20\.000"/);
  assert.match(html, /&lt;模型&gt;/);
  assert.doesNotMatch(html, /undefined/);
  assert.match(html, /images\/03\.jpg/, "a quick hit shows its picture small");
  assert.match(html, /e-acc\.ai/);
  assert.deepEqual(tokens("Earth AI 的 3 公里"), ["Earth", " ", "AI", " ", "的", " ", "3", " ", "公", "里"]);
});
