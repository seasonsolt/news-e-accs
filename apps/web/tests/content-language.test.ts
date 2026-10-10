import assert from "node:assert/strict";
import { test } from "node:test";
import { bodyLocale, contentHtmlLanguage, editionPending, hasBothEditions } from "../app/lib/content-language.ts";
import { contentUrl } from "../app/lib/content-fetch.ts";

test("native English and Chinese originals, auxiliary editions and legacy fallbacks describe their actual language", () => {
  const english = { editorialLanguage: "en", contentLanguage: { status: "original", sourceLanguage: "en" }, title: "Original English" } as const;
  const chinese = { editorialLanguage: "zh", contentLanguage: { status: "original", sourceLanguage: "zh" }, title: "中文标题" } as const;
  assert.equal(editionPending(english, "en"), false);
  assert.equal(contentHtmlLanguage(english, "en"), "en");
  assert.equal(editionPending(english, "zh"), true);
  assert.equal(editionPending(chinese, "en"), true);
  assert.equal(editionPending(chinese, "zh"), false);
  assert.equal(contentHtmlLanguage(chinese, "en"), "zh-CN");
  assert.equal(contentHtmlLanguage({ ...english, contentLanguage: { status: "translated", sourceLanguage: "en" } }, "zh"), "zh-CN");
  assert.equal(editionPending({ ...english, contentLanguage: { status: "original", sourceLanguage: "original" } }, "en"), false);
  assert.equal(contentHtmlLanguage({ title: "这是旧稿" }, "en"), "zh-CN");
  assert.equal(contentHtmlLanguage({ title: "Unknown original language" }, "en"), undefined);
  assert.equal(hasBothEditions({ contentLanguage: { requested: "en", status: "translated", sourceLanguage: "zh", language: "unknown" } }), false);
  const nativeActual = { editorialLanguage: "zh", contentLanguage: { requested: "en", status: "original", sourceLanguage: "zh", language: "en" }, title: "Actual English copy" } as const;
  assert.equal(editionPending(nativeActual, "en"), false);
  assert.equal(contentHtmlLanguage(nativeActual, "en"), "en");
  assert.equal(contentHtmlLanguage({ ...nativeActual, contentLanguage: { ...nativeActual.contentLanguage, language: "unknown" } }, "en"), undefined);
  assert.equal(contentHtmlLanguage({ ...nativeActual, contentLanguage: { ...nativeActual.contentLanguage, status: "translated", language: "zh" } }, "en"), "zh-CN");
});

test("body language remains independent of the editorial language", () => {
  assert.equal(bodyLocale({ status: "original", sourceLanguage: "en" }, "en", "zh"), "en");
  assert.equal(bodyLocale({ status: "translated", sourceLanguage: "en" }, "zh", "en"), "zh");
  assert.equal(bodyLocale({ status: "original", sourceLanguage: "original" }, "en", "en"), null);
  assert.equal(bodyLocale({ status: "original-english" }, "en"), "en");
  assert.equal(bodyLocale(undefined, "en", "zh"), "zh");
  assert.equal(bodyLocale({ status: "original", sourceLanguage: "zh", language: "en" }, "en", "zh"), "en");
  assert.equal(bodyLocale({ status: "original-english", sourceLanguage: "en", language: "en" }, "en"), "en");
  assert.equal(bodyLocale({ status: "original", sourceLanguage: "en", language: "unknown" }, "en", "en"), null);
  assert.equal(bodyLocale({ status: "original", sourceLanguage: "fr", language: "fr" }, "en"), "fr");
  assert.equal(bodyLocale({ status: "translated", sourceLanguage: "fr", language: "zh", requested: "zh" }, "en"), "zh");
});

test("SSR and client content API language is explicit and follows the URL", () => {
  const zh = new Request("https://e-acc.ai/zh/all.data", { headers: { Cookie: "eacc_language=en" } });
  assert.equal(contentUrl("/api/site/pool?q=robot&lang=en", zh), "/api/site/pool?q=robot&lang=zh");
  assert.equal(contentUrl("http://api.local/api/site/items/1", zh), "http://api.local/api/site/items/1?lang=zh");
  const en = new Request("https://e-acc.ai/all.data", { headers: { Cookie: "eacc_language=zh", "Accept-Language": "zh" } });
  assert.equal(contentUrl("/api/site/items/1", en), "/api/site/items/1?lang=en");
  assert.equal(contentUrl("/api/site/items/1", en, "zh"), "/api/site/items/1?lang=zh");
  const originalWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: { location: { pathname: "/zh/all" } } });
    assert.equal(contentUrl("/api/site/timeline?cursor=1"), "/api/site/timeline?cursor=1&lang=zh");
    Object.assign(globalThis, { window: { location: { pathname: "/all" } } });
    assert.equal(contentUrl("/api/site/timeline?cursor=1"), "/api/site/timeline?cursor=1&lang=en");
    assert.equal(contentUrl("/api/admin/me"), "/api/admin/me");
  } finally {
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, "window");
    else globalThis.window = originalWindow;
  }
});


test('unknown mixed story prose stays pending until a verified edition replaces the remaining segments', () => {
  const story = { editorialLanguage:'en',title:'An English digest title',summary:'历史中文摘要',contentLanguage:{requested:'en',status:'original',sourceLanguage:'unknown',language:'unknown'} } as const;
  assert.equal(editionPending(story,'en'),true); assert.equal(editionPending(story,'zh'),true);
  assert.equal(contentHtmlLanguage(story,'en'),undefined);
  assert.equal(editionPending({...story,contentLanguage:{...story.contentLanguage,status:'translated',language:'en'}},'en'),false);
});
