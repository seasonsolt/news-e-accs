import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import { PRODUCTS, featuredProduct } from "../../../industry/products.ts";

test("products renders a live wallpaper link and the wallpaper page renders without a key", async () => {
  const server = await createServer({ configFile: false, resolve: { alias: { "@aihot/web/": new URL("../app/", import.meta.url).pathname } }, server: { middlewareMode: true, ws: false }, appType: "custom" });
  try {
    const products = await server.ssrLoadModule("/apps/web/app/routes/products.tsx");
    const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(products.default)));
    assert.match(html, /href="\/products\/wallpaper"/);
    assert.match(html, /Available/);
    assert.equal(featuredProduct()?.url, "/products/wallpaper");
    assert.ok(PRODUCTS.some((p) => p.status === "live"));
    const page = await server.ssrLoadModule("/modules/wallpaper/web/page.tsx");
    const empty = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(page.WallpaperPage, { list: [] })));
    assert.match(empty, /type="email"/);
    assert.match(empty, /Get my wallpaper link/);
    assert.doesNotMatch(empty, /\?key=/);
  } finally { await server.close(); }
});
