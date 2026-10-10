import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorOf, CONCEPT_PAGES, type ConceptBlock, type ConceptPage } from "../../../industry/concepts.ts";
import { CONCEPT_PAGES_ZH } from "../../../industry/concepts-zh.ts";
import { localePath } from "../app/lib/locale.ts";

const SLUGS = Object.keys(CONCEPT_PAGES) as Array<keyof typeof CONCEPT_PAGES>;
const ENGLISH_ADDRESSES = new Set(SLUGS.map((s) => `/${s}`));
const HAN = /\p{Script=Han}/u;

/** Every site address a page's text links to (hrefs in its HTML, its link lists and glossary entries). */
function hrefsOf(page: ConceptPage): string[] {
  const html = [page.lead, ...page.blocks.flatMap((b) => ("html" in b ? [b.html] : [])), ...(page.terms ?? []).map((t) => t.def)].join("\n");
  const inHtml = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.split("#")[0]!);
  const inLists = page.blocks.flatMap((b) => (b.kind === "links" ? b.links.map((l) => l.href) : []));
  return [...inHtml, ...inLists];
}

test("each Chinese edition has the English page's structure, anchors and glossary ids", () => {
  for (const slug of SLUGS) {
    const en = CONCEPT_PAGES[slug], zh = CONCEPT_PAGES_ZH[slug];
    assert.equal(zh.slug, slug);
    assert.deepEqual(zh.blocks.map((b: ConceptBlock) => b.kind), en.blocks.map((b: ConceptBlock) => b.kind), `${slug} blocks`);
    en.blocks.forEach((block, i) => {
      const other = zh.blocks[i]!;
      if (block.kind === "section" || block.kind === "links") assert.equal((other as typeof block).id, anchorOf(block.heading), `${slug} block ${i}: anchors match so links work in both`);
    });
    assert.equal(zh.faq?.length, en.faq?.length, `${slug} FAQ`);
    assert.deepEqual(zh.terms?.map((t) => t.id), en.terms?.map((t) => t.id), `${slug} glossary ids`);
  }
});

test("the Chinese editions are written in Chinese and stay among themselves", () => {
  for (const slug of SLUGS) {
    const zh = CONCEPT_PAGES_ZH[slug], en = CONCEPT_PAGES[slug];
    for (const text of [zh.title, zh.description, zh.h1, zh.lead]) assert.match(text, HAN, `${slug}: ${text.slice(0, 30)}`);
    for (const q of zh.faq ?? []) assert.match(q.q + q.a, HAN, `${slug} FAQ`);
    for (const t of zh.terms ?? []) assert.match(t.term + t.def, HAN, `${slug} term ${t.id}`);
    // A link to another concept page must go to its Chinese edition, and the English pages never link to /zh/.
    for (const href of hrefsOf(zh)) {
      assert.ok(!ENGLISH_ADDRESSES.has(href), `${slug}: ${href} is the English edition`);
      // Wherever the site has a Chinese edition of a page, the Chinese text links to it.
      if (href.startsWith("/")) assert.equal(localePath(href, "zh"), href, `${slug}: ${href} has a Chinese edition at ${localePath(href, "zh")}`);
    }
    for (const href of hrefsOf(en)) assert.ok(!href.startsWith("/zh"), `${slug}: English page links to ${href}`);
    assert.notEqual(zh.title, en.title);
  }
});
