// Scene textures, packed meshes and lighting (modules/scenes/README.md) map to the same
// scenes/<scene>/<name>.<hash>.<webp|glb|hdr> key in R2. Content hashes keep cached copies valid.
const SCENE_FILE = /^\/media\/scenes\/([a-z0-9-]+)\/([a-z0-9-]+\.[0-9a-f]{10}\.(?:webp|glb|hdr))$/;
const SITE = "https://e-acc.ai";

/** The R2 key a request asks for, or null when it is not a scene file. */
export function sceneKey(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const match = SCENE_FILE.exec(new URL(request.url).pathname);
  return match ? `scenes/${match[1]}/${match[2]}` : null;
}

export async function serveScene(request, key, env, ctx) {
  const cacheKey = new Request(`${SITE}/media/${key}`, { method: "GET" });
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  const hit = Boolean(response);
  if (!response) {
    const object = await env.MEDIA.get(key);
    if (!object) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
    response = new Response(object.body, {
      headers: {
        "content-type": key.endsWith(".glb") ? "model/gltf-binary" : key.endsWith(".hdr") ? "application/octet-stream" : "image/webp",
        "content-length": String(object.size),
        "cache-control": "public, max-age=31536000, immutable",
        etag: object.httpEtag,
      },
    });
    if (request.method === "GET") ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  if (request.headers.get("if-none-match") === response.headers.get("etag")) {
    return new Response(null, { status: 304, headers: { etag: response.headers.get("etag"), "cache-control": response.headers.get("cache-control") } });
  }
  const result = new Response(request.method === "HEAD" ? null : response.body, response);
  result.headers.set("x-eacc-edge-cache", hit ? "HIT" : "MISS");
  return result;
}
