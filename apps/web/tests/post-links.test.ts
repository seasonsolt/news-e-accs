import assert from "node:assert/strict";
import test from "node:test";
import { withoutShortLinks } from "../app/features/item/post-links.ts";

test("post text drops its t.co links and counts them", () => {
  assert.deepEqual(
    withoutShortLinks("Learn more about Gemini 4 Argon from the people who built it: https://t.co/Uhks43bv4M"),
    { text: "Learn more about Gemini 4 Argon from the people who built it", links: 1 },
  );
  assert.deepEqual(withoutShortLinks("Two links https://t.co/a1 and https://t.co/b2 here"), { text: "Two links and here", links: 2 });
  assert.deepEqual(withoutShortLinks("向打造 Gemini 4 Argon 的团队成员了解更多"), { text: "向打造 Gemini 4 Argon 的团队成员了解更多", links: 0 });
});

test("a post that is only a link keeps its text, since nothing else would show", () => {
  assert.deepEqual(withoutShortLinks("https://t.co/Uhks43bv4M"), { text: "https://t.co/Uhks43bv4M", links: 0 });
});
