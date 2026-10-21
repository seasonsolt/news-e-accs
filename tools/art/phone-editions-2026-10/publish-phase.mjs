import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sql } from '/srv/eacc/app/packages/backend/src/db.ts';
import { audit } from '/srv/eacc/app/packages/backend/src/audit.ts';
import { put, link, remote } from '/srv/eacc/app/modules/wallpaper/src/store.ts';
import { directory } from '/srv/eacc/app/modules/wallpaper/src/admin.ts';
import sharp from '/srv/eacc/app/node_modules/sharp/lib/index.js';

const dir = process.argv[2];
if (!dir) throw new Error('Release directory required');
const release = JSON.parse(await readFile(`${dir}/release.json`, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
try {
  if (!remote()) throw new Error('Private wallpaper store required');
  const before = await sql`SELECT id, day::text, title_zh, title_en, desktop_file, phone_file, preview_file FROM wallpapers ORDER BY id`;
  for (const item of release.items) {
    const row = before.find(r => r.id === item.id);
    if (!row || ['day', 'desktop_file', 'phone_file', 'preview_file', 'title_zh', 'title_en'].some(k => row[k] !== item[k])) throw new Error(`Wallpaper changed: ${item.id}`);
  }
  await writeFile(`${dir}/before.json`, JSON.stringify(before, null, 2), { flag: 'wx' });
  for (const item of release.items) {
    for (const kind of ['phone', 'preview']) {
      const file = item[kind];
      const bytes = await readFile(`${dir}/${file.file}`);
      if (hash(bytes) !== file.sha256) throw new Error(`Hash mismatch: ${item.id}/${kind}`);
      const meta = await sharp(bytes).metadata();
      if (kind === 'phone' ? meta.width !== 2160 || meta.height !== 3840 || meta.format !== 'jpeg' : meta.width !== 1600 || meta.format !== 'webp') throw new Error(`Invalid image: ${item.id}/${kind}`);
      if (kind === 'phone') {
        await put(file.file, bytes);
        const response = await fetch(link(file.file, file.file));
        if (!response.ok || hash(Buffer.from(await response.arrayBuffer())) !== file.sha256) throw new Error(`Remote readback failed: ${item.id}`);
      } else await writeFile(`${directory()}/${file.file}`, bytes);
    }
    console.log(`Stored and verified ${item.id}`);
  }
  await sql.begin(async tx => {
    for (const item of release.items) {
      const rows = await tx`UPDATE wallpapers SET phone_file=${item.phone.file}, preview_file=${item.preview.file}
        WHERE id=${item.id} AND day=${item.day} AND desktop_file=${item.desktop_file} AND phone_file=${item.phone_file} AND preview_file=${item.preview_file} RETURNING id`;
      if (rows.length !== 1) throw new Error(`Concurrent wallpaper change: ${item.id}`);
      await audit('codex:user-authorized-2026-10-21', 'wallpaper.phone-edition', `wallpaper:${item.id}`, 'Phase 1 dedicated phone wallpaper and AI scene preview', { phone_file: item.phone_file, preview_file: item.preview_file }, { phone_file: item.phone.file, preview_file: item.preview.file }, { db: tx });
    }
  });
  await writeFile(`${dir}/after.json`, JSON.stringify(await sql`SELECT id, day::text, desktop_file, phone_file, preview_file FROM wallpapers ORDER BY id`, null, 2));
  console.log(`Published ${release.items.length} phone editions; IDs, dates, desktop files and downloads preserved.`);
} finally { await sql.end(); }
