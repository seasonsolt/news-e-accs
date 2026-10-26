// Poly Haven's published glTF + checksum-pinned resources → one self-contained GLB.
// Geometry is preserved. Only image resolution/encoding changes for browser delivery.
import { createHash } from "node:crypto";
import sharp from "sharp";

export interface Download { url: string; md5: string }
export interface GltfSource extends Download { include: Record<string, Download>; alpha?: Download }
export async function download(source: Download): Promise<Buffer> {
  const response = await fetch(source.url, { headers: { "User-Agent": "eacc-chronicle-local-asset-preparation" } });
  if (!response.ok) throw new Error(`${response.status}: ${source.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("md5").update(bytes).digest("hex") !== source.md5) throw new Error(`Source checksum differs: ${source.url}`);
  return bytes;
}

interface Gltf {
  buffers: Array<{ uri?: string; byteLength: number }>;
  bufferViews: Array<{ buffer: number; byteOffset?: number; byteLength: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string }>;
  materials?: Array<{ alphaMode?: string; alphaCutoff?: number; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }>;
  textures?: Array<{ source: number }>;
}

export async function packGltf(source: GltfSource, width: number, quality: number): Promise<Buffer> {
  const document = JSON.parse((await download(source)).toString("utf8")) as Gltf;
  if (document.buffers.length !== 1 || !document.buffers[0]?.uri) throw new Error("Expected one external geometry buffer");
  const resource = async (uri: string) => {
    const item = source.include[uri];
    if (!item) throw new Error(`Unrecorded glTF resource: ${uri}`);
    return download(item);
  };
  const chunks: Buffer[] = [];
  let length = 0;
  function append(bytes: Buffer) {
    const offset = length, padding = (4 - bytes.length % 4) % 4;
    chunks.push(bytes, Buffer.alloc(padding)); length += bytes.length + padding; return offset;
  }
  append(await resource(document.buffers[0].uri));
  const alphaBytes = source.alpha ? await download(source.alpha) : null;
  for (const [imageIndex, image] of (document.images ?? []).entries()) {
    if (!image.uri) throw new Error("Expected external glTF images");
    const normalOrArm = /nor_|arm_/.test(image.uri);
    const original = await resource(image.uri), baseColor = document.materials?.some((m) => document.textures?.[m.pbrMetallicRoughness?.baseColorTexture?.index ?? -1]?.source === imageIndex);
    const alpha = !!(await sharp(original).metadata()).hasAlpha || !!(baseColor && alphaBytes);
    const resized = sharp(original).resize({ width: normalOrArm ? Math.min(width, 1024) : width, withoutEnlargement: true });
    let bytes: Buffer;
    if (baseColor && alphaBytes) {
      const rgb = await resized.removeAlpha().png().toBuffer(), size = await sharp(rgb).metadata();
      const mask = await sharp(alphaBytes).resize(size.width!, size.height!).extractChannel(0).raw().toBuffer();
      bytes = await sharp(rgb).joinChannel(mask, { raw: { width: size.width!, height: size.height!, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();
      for (const m of document.materials ?? []) if (document.textures?.[m.pbrMetallicRoughness?.baseColorTexture?.index ?? -1]?.source === imageIndex) { m.alphaMode = "MASK"; m.alphaCutoff = .5; }
    } else bytes = await (alpha ? resized.png({ compressionLevel: 9 }) : resized.jpeg({ quality, chromaSubsampling: "4:4:4" })).toBuffer();
    const byteOffset = append(bytes);
    image.bufferView = document.bufferViews.length;
    document.bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.length });
    image.mimeType = alpha ? "image/png" : "image/jpeg"; delete image.uri;
  }
  document.buffers = [{ byteLength: length }];
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]), bin = Buffer.concat(chunks);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + padded.length + 8 + bin.length, 8);
  jsonHeader.writeUInt32LE(padded.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, padded, binHeader, bin]);
}
