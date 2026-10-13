// A model's JSON answer is read as the object it wrote, including the shapes models actually return:
// a fenced block, raw newlines inside strings, and one closing brace too many.
import "./setup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson } from "@aihot/backend/providers/llm";

test("fenced JSON and raw newlines inside strings parse", () => {
  assert.deepEqual(extractJson('```json\n{"a":"line one\nline two"}\n```'), { a: "line one\nline two" });
});

test("an extra closing brace after the object still yields the object", () => {
  // Seen from the translate model in production: {"translations":{...}}} stalled the Chinese sweep.
  const answer = '{"translations":{"title":"标题 {不是括号}","summary":"第一段\n\n第二段 \\"引用\\" }"}}}';
  assert.deepEqual(extractJson(answer), { translations: { title: "标题 {不是括号}", summary: '第一段\n\n第二段 "引用" }' } });
});

test("an object that never closes is still unusable", () => {
  assert.throws(() => extractJson('{"translations":{"title":"标题"}'), SyntaxError);
});
