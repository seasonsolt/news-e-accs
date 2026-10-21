import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const exists = async (file) => access(path.join(root, file)).then(() => true, () => false);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await mkdir(path.join(root, 'previews'), { recursive: true });
const cards = [];
for (const item of manifest.items) {
  const stem = `${String(item.id).padStart(3, '0')}-${item.art}`;
  for (const [key, file] of Object.entries({ portrait: `originals/${stem}.png`, phone: `phone/${stem}.jpg`, mockup: `mockups/${stem}-pair.png` })) {
    if (await exists(file)) item[key] = file;
    else delete item[key];
  }
  item.status = item.phone && item.mockup ? 'ready-for-review' : item.portrait ? 'in-progress' : 'pending';
  if (item.mockup) {
    item.preview = `previews/${stem}.webp`;
    if (!await exists(item.preview)) await sharp(path.join(root, item.mockup)).resize(1600).webp({ quality: 85 }).toFile(path.join(root, item.preview));
  }
  const image = item.preview ?? item.portrait;
  cards.push(`<article><h2>${escape(item.title_zh)}</h2><p>#${item.id} · ${item.day}</p>${image ? `<a href="${escape(item.mockup ?? image)}"><img loading="lazy" src="${escape(image)}" alt="${escape(item.title_zh)}"></a>` : '<p>制作中</p>'}<nav>${item.portrait ? `<a href="${item.portrait}">竖版原作</a>` : ''}${item.phone ? `<a href="${item.phone}" download>下载手机壁纸</a>` : ''}</nav></article>`);
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(root, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>手机专属壁纸 · 140 套</title><style>body{margin:0;background:#141918;color:#ece9df;font:16px system-ui}header,main{max-width:1400px;margin:auto;padding:28px}h1{font-size:32px}header p{color:#b5bdb7;line-height:1.7}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{background:#222b27;border-radius:16px;padding:16px}h2{font-size:20px;margin:4px 0}article p{color:#b5bdb7}img{width:100%;height:300px;object-fit:contain;background:#111715;border-radius:10px}nav{display:flex;gap:20px;padding:16px 0 0}a{color:#dfbd7b}</style><header><h1>手机专属壁纸</h1><p>网站现有全部 140 套 · 独立竖版构图 · 锁屏与主屏 AI 场景示意<br>手机文件为 2160×3840 放大导出；场景图为 AI 合成，下载文件不含设备或界面。此页为本地制作总览，包含尚未到发布日期的作品。</p></header><main>${cards.join('')}</main></html>`);
console.log(JSON.stringify({ portraits: manifest.items.filter(x => x.portrait).length, phones: manifest.items.filter(x => x.phone).length, mockups: manifest.items.filter(x => x.mockup).length }));
