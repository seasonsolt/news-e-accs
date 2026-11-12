// Writing styles: the voice the author picks per essay. A style is a skill: a SKILL.md (frontmatter `name`,
// `description`, then the instructions) and any reference `.md` files beside it. The site ships a few in
// industry/essay-styles/<name>/ (see the README there); the author uploads others at the desk
// (essay_styles), usable at once. Every model step of an essay puts the chosen style in its system prompt,
// and every revision a model writes records the style's name and content fingerprint.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import { sql, type Db } from "@aihot/backend/db";
import { audit, Conflict } from "@aihot/backend/audit";
import type { EssayStyle, EssayStyleUpload } from "../contracts.ts";

const DIR = path.join(REPO_ROOT, "industry/essay-styles");
export const STYLE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The style a new essay starts with. */
export const DEFAULT_STYLE = "plain";

/** An upload's bounds: a skill is a page or two of instructions and a few references. */
const MAX_FILES = 60;
const MAX_CHARS = 300_000;
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024;

export interface LoadedStyle extends EssayStyle {
  /** The instructions and reference files, as the prompt reads them. */
  text: string;
}

type StyleFile = {
  path: string;
  content: string;
};

const bad = (message: string) => Object.assign(new Error(message), { statusCode: 400 });

function frontmatter(source: string): { fields: Record<string, string>; body: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { fields: {}, body: source };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const f = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (f) fields[f[1]!] = f[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: source.slice(m[0].length) };
}

/** The style a skill's files make: SKILL.md's instructions, then each reference under its path. */
function compose(files: StyleFile[]): { description: string; text: string; hash: string; frontName: string | null } {
  const skill = files.find((f) => f.path === "SKILL.md");
  if (!skill) throw bad("没有 SKILL.md。");
  const { fields, body } = frontmatter(skill.content);
  const parts = [body.trim(), ...files.filter((f) => f !== skill).map((f) => `## Reference: ${f.path}\n\n${f.content.trim()}`)];
  const text = parts.filter(Boolean).join("\n\n");
  if (!text.trim()) throw bad("SKILL.md 里没有写作要求。");
  return { description: fields.description ?? "", text, hash: createHash("sha256").update(text).digest("hex").slice(0, 16), frontName: fields.name ?? null };
}

function builtin(name: string): LoadedStyle | null {
  const dir = path.join(DIR, name);
  let files: StyleFile[];
  try {
    const rels = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((rel) => rel.endsWith(".md") && statSync(path.join(dir, rel)).isFile());
    files = sortFiles(rels.map((rel) => ({ path: rel.split(path.sep).join("/"), content: readFileSync(path.join(dir, rel), "utf8") })));
  } catch {
    return null;
  }
  if (!files.some((f) => f.path === "SKILL.md")) return null;
  const composed = compose(files);
  return { name, description: composed.description, hash: composed.hash, text: composed.text, source: "builtin", files: files.map((f) => f.path), uploadedBy: null, updatedAt: null, essays: 0 };
}

function builtinNames(): string[] {
  try {
    return readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && STYLE_NAME.test(d.name)).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

const sortFiles = (files: StyleFile[]) => [...files].sort((a, b) => (a.path === "SKILL.md" ? -1 : b.path === "SKILL.md" ? 1 : a.path.localeCompare(b.path)));

interface UploadedRow {
  name: string;
  files: StyleFile[];
  uploaded_by: string;
  updated_at: Date;
}

function uploaded(row: UploadedRow): LoadedStyle {
  const composed = compose(row.files);
  return { name: row.name, description: composed.description, hash: composed.hash, text: composed.text, source: "uploaded",
    files: row.files.map((f) => f.path), uploadedBy: row.uploaded_by, updatedAt: new Date(row.updated_at).toISOString(), essays: 0 };
}

/** Every style, the site's first; with how many essays use each. */
export async function essayStyles(): Promise<LoadedStyle[]> {
  const [rows, counts] = await Promise.all([
    sql<UploadedRow[]>`SELECT name, files, uploaded_by, updated_at FROM essay_styles ORDER BY name`,
    sql<{ style: string; n: number }[]>`SELECT style, count(*)::int AS n FROM essays GROUP BY style`,
  ]);
  const used = new Map(counts.map((c) => [c.style, c.n]));
  return [...builtinNames().flatMap((n) => builtin(n) ?? []), ...rows.map(uploaded)].map((s) => ({ ...s, essays: used.get(s.name) ?? 0 }));
}

export async function essayStyle(name: string): Promise<LoadedStyle | null> {
  if (!STYLE_NAME.test(name)) return null;
  const shipped = builtin(name);
  if (shipped) return shipped;
  const [row] = await sql<UploadedRow[]>`SELECT name, files, uploaded_by, updated_at FROM essay_styles WHERE name = ${name}`;
  return row ? uploaded(row) : null;
}

/** Whether a style of this name can be used. In a transaction an uploaded one stays until it commits. */
export async function styleExists(name: string, db: Db = sql): Promise<boolean> {
  if (!STYLE_NAME.test(name)) return false;
  if (builtin(name)) return true;
  const [row] = await db`SELECT 1 FROM essay_styles WHERE name = ${name} FOR SHARE`;
  return !!row;
}

export const publicStyle = ({ text: _text, ...style }: LoadedStyle): EssayStyle => style;

/** The skill's files with paths relative to the folder holding SKILL.md; other files are not instructions and are left out. */
function skillFiles(files: StyleFile[]): StyleFile[] {
  const clean = files.map((f) => ({ path: f.path.replace(/\\/g, "/").replace(/^\/+/, ""), content: f.content }))
    .filter((f) => !f.path.split("/").some((part) => part === ".." || part.startsWith(".") || part === "__MACOSX"));
  const skills = clean.filter((f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md")).sort((a, b) => a.path.length - b.path.length);
  if (!skills.length) throw bad("没找到 SKILL.md：上传整个 skill 文件夹、它的 .zip / .skill 包，或至少一份 SKILL.md。");
  const root = skills[0]!.path.slice(0, -"SKILL.md".length);
  const inside = clean.filter((f) => f.path.startsWith(root) && /\.(md|markdown|txt)$/i.test(f.path)).map((f) => ({ path: f.path.slice(root.length), content: f.content }));
  if (inside.length > MAX_FILES) throw bad(`文件太多了（上限 ${MAX_FILES} 个）。`);
  if (inside.reduce((n, f) => n + f.content.length, 0) > MAX_CHARS) throw bad("内容太长了（上限 30 万字）。");
  return sortFiles(inside);
}

async function unzip(dataUrl: string): Promise<StyleFile[]> {
  const m = /^data:[^;,]*;base64,(.+)$/s.exec(dataUrl);
  if (!m) throw bad("压缩包要是 .zip 或 .skill。");
  const bytes = Buffer.from(m[1]!, "base64");
  if (bytes.length > MAX_ARCHIVE_BYTES) throw bad("压缩包太大了（上限 5 MB）。");
  const { unzipSync, strFromU8 } = await import("fflate");
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    // Only text files are read, and their unpacked size is bounded before they are unpacked.
    entries = unzipSync(new Uint8Array(bytes), { filter: (f) => {
      if (!/\.(md|markdown|txt)$/i.test(f.name)) return false;
      total += f.originalSize;
      if (total > MAX_CHARS * 4) throw bad("压缩包解开后太大了。");
      return true;
    } });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    throw bad("读不出这个压缩包。");
  }
  return Object.entries(entries).map(([p, data]) => ({ path: p, content: strFromU8(data) }));
}

/** Adds an uploaded style, or replaces the uploaded one of the same name. Usable at once. */
export async function uploadStyle(input: EssayStyleUpload, actor: string): Promise<EssayStyle> {
  const raw = input.archive ? await unzip(input.archive) : input.files ?? [];
  const files = skillFiles(raw);
  const composed = compose(files);
  const name = (input.name?.trim() || composed.frontName || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  if (!STYLE_NAME.test(name)) throw bad("文风要有名字：SKILL.md 开头写 name，或上传时填一个（小写字母、数字、连字符）。");
  if (builtinNames().includes(name)) throw new Conflict(`${name} 是站点自带的文风，换个名字。`);
  await sql`INSERT INTO essay_styles (name, files, uploaded_by) VALUES (${name}, ${sql.json(files)}, ${actor})
    ON CONFLICT (name) DO UPDATE SET files = EXCLUDED.files, uploaded_by = EXCLUDED.uploaded_by, updated_at = now()`;
  await audit(actor, "essay.style.upload", `essay-style:${name}`, null, null, { files: files.map((f) => f.path), hash: composed.hash }, {});
  return publicStyle((await essayStyles()).find((s) => s.name === name)!);
}

/** Removes an uploaded style no essay uses. */
export async function removeStyle(name: string, actor: string): Promise<{ ok: true }> {
  await sql.begin(async (tx) => {
    const [row] = await tx`SELECT name FROM essay_styles WHERE name = ${name} FOR UPDATE`;
    if (!row) throw Object.assign(new Error(builtinNames().includes(name) ? "站点自带的文风不能删。" : "没有这个文风。"), { statusCode: builtinNames().includes(name) ? 400 : 404 });
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM essays WHERE style = ${name}`;
    if (n) throw new Conflict(`还有 ${n} 篇文章用这个文风，先给它们换一个。`);
    await tx`DELETE FROM essay_styles WHERE name = ${name}`;
    await audit(actor, "essay.style.remove", `essay-style:${name}`, null, null, null, { db: tx });
  });
  return { ok: true };
}
