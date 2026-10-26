import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { packGltf } from "../scripts/pack-gltf.ts";

test("model packaging preserves geometry, embeds a separate leaf alpha map and rejects changed source bytes", async () => {
  const binary = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const color = await sharp({ create: { width: 2, height: 1, channels: 3, background: "#628442" } }).jpeg().toBuffer();
  const mask = await sharp(Buffer.from([0, 255]), { raw: { width: 2, height: 1, channels: 1 } }).png().toBuffer();
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin", byteLength: binary.length }], bufferViews: [{ buffer: 0, byteLength: binary.length }], images: [{ uri: "leaves.jpg" }], textures: [{ source: 0 }], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }] }));
  const files = new Map([["/model.gltf", json], ["/mesh.bin", binary], ["/leaves.jpg", color], ["/alpha.png", mask]]);
  const server = createServer((req, res) => { const bytes = files.get(req.url!); res.statusCode = bytes ? 200 : 404; res.end(bytes); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const item = (name: string) => ({ url: base + name, md5: createHash("md5").update(files.get(name)!).digest("hex") });
    const source = { ...item("/model.gltf"), alpha: item("/alpha.png"), include: { "mesh.bin": item("/mesh.bin"), "leaves.jpg": item("/leaves.jpg") } };
    const glb = await packGltf(source, 2, 90);
    assert.equal(glb.readUInt32LE(0), 0x46546c67); assert.equal(glb.readUInt32LE(8), glb.length);
    const size = glb.readUInt32LE(12), document = JSON.parse(glb.subarray(20, 20 + size).toString("utf8")), data = glb.subarray(20 + size + 8);
    assert.equal(document.buffers[0].uri, undefined);
    assert.deepEqual(data.subarray(0, binary.length), binary);
    assert.equal(document.images[0].uri, undefined); assert.equal(document.images[0].mimeType, "image/png");
    assert.equal(document.materials[0].alphaMode, "MASK");
    const view = document.bufferViews[document.images[0].bufferView];
    const image = await sharp(data.subarray(view.byteOffset, view.byteOffset + view.byteLength)).ensureAlpha().raw().toBuffer();
    assert.equal(image[3], 0); assert.equal(image[7], 255);
    files.set("/mesh.bin", Buffer.from("changed"));
    await assert.rejects(packGltf(source, 2, 90), /Source checksum differs/);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
