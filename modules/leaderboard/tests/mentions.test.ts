import assert from "node:assert/strict";
import { test } from "node:test";
import { mentioned, namePattern } from "../backend/mentions.ts";

const models = [
  { slug: "gemini-4-argon", name: "Gemini 4 Argon" },
  { slug: "gpt-5", name: "GPT-5" },
  { slug: "gpt-5-5", name: "GPT-5.5" },
  { slug: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { slug: "claude-opus-5-5-fast", name: "Claude Opus 5.5 Fast" },
  { slug: "muse", name: "Muse" },
  { slug: "nano", name: "GPT-5.4 nano (2026-03-17)" },
];

test("a model is found by its full name, whatever separates its words", () => {
  assert.deepEqual(mentioned("Google DeepMind Says Four Gemini 4 Argon Agents Beat Minecraft", models), ["gemini-4-argon"]);
  assert.deepEqual(mentioned("谷歌发布 gemini-4-argon，性能超过 GPT‑5", models), ["gemini-4-argon"], "an unusual hyphen is not a separator");
  assert.deepEqual(mentioned("OpenAI 的 GPT5 与 GPT-5.4 nano 对比", models), ["gpt-5", "nano"]);
});

test("a shorter name inside a longer one is not a separate mention", () => {
  assert.deepEqual(mentioned("GPT-5.5 is out", models), ["gpt-5-5"], "GPT-5 is not inside GPT-5.5");
  assert.deepEqual(mentioned("Claude Opus 5.5 Fast and Claude Opus 5.5 compared", models), ["claude-opus-5-5-fast", "claude-opus-5-5"]);
  assert.deepEqual(mentioned("Claude Opus 5.5 Fast is cheaper", models), ["claude-opus-5-5-fast"]);
  assert.deepEqual(mentioned("Claude Opus 5.50 and GPT-55", models), []);
});

test("one-word names are never matched", () => {
  assert.equal(namePattern("Muse"), null);
  assert.deepEqual(mentioned("Alexandr Wang Recommends Muse for Coding", models), []);
});
