// e-acc.ai edge Worker: forwards every request to the news site (this repository, on DMIT behind a
// Cloudflare Tunnel) with the edge secret, and keeps anonymous public responses in the Cache API.
import { isCacheEligible, isCacheable } from "./cache.mjs";
import { sceneKey, serveScene } from "./scenes.mjs";

const SITE = "https://e-acc.ai";
const ORIGIN_CACHE_CONTROL = "x-eacc-origin-cache-control";

/** The news site, which serves only requests carrying the edge secret (apps/web/server.ts). */
function toNews(request, env) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.set("x-eacc-edge", env.EDGE_SECRET);
  headers.set("x-eacc-client-ip", request.headers.get("cf-connecting-ip") ?? "");
  headers.set("x-eacc-country", request.cf?.country ?? "");
  headers.set("x-forwarded-host", url.host);
  return fetch(new URL(`${url.pathname}${url.search}`, env.NEWS_ORIGIN), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });
}

export default {
  async fetch(request, env, ctx) {
    const scene = sceneKey(request);
    if (scene) return serveScene(request, scene, env, ctx);
    if (!isCacheEligible(request)) return toNews(request, env);
    const url = new URL(request.url);
    let search = url.search;
    if (url.pathname.endsWith(".data")) {
      // Public navigation returns all matched loaders; remove _routes without re-encoding the other parameters.
      const query = search.slice(1).split("&").filter((part) => !new URLSearchParams(`?${part}`).has("_routes")).join("&");
      search = query ? `?${query}` : "";
    }
    const key = new Request(`${SITE}${url.pathname}${search}`, { method: "GET" });
    const cache = caches.default;
    const cached = await cache.match(key);
    const response = cached ?? await toNews(request, env);
    // A HEAD miss has no body and must not populate the shared GET entry.
    if (!cached && request.method === "GET" && isCacheable(response)) {
      // The zone's Browser Cache TTL rewrites max-age on cached copies; keep the origin's header to restore on hits.
      const stored = new Response(response.clone().body, response);
      stored.headers.set(ORIGIN_CACHE_CONTROL, response.headers.get("cache-control"));
      ctx.waitUntil(cache.put(key, stored));
    }
    const result = new Response(request.method === "HEAD" ? null : response.body, response);
    const original = cached?.headers.get(ORIGIN_CACHE_CONTROL);
    if (original) result.headers.set("cache-control", original);
    result.headers.delete(ORIGIN_CACHE_CONTROL);
    result.headers.set("x-eacc-edge-cache", cached ? "HIT" : "MISS");
    return result;
  },
};
