// Writing styles (industry/essay-styles/<name>/SKILL.md, see the README there): the voice the author picks
// per essay. Every model step of an essay puts the chosen style in its system prompt, and every revision a
// model writes records the style's name and content fingerprint.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@aihot/backend/config";
import type { EssayStyle } from "../contracts.ts";

const DIR = path.join(REPO_ROOT, "industry/essay-styles");
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface LoadedStyle extends EssayStyle {
  /** The instructions and reference files, as the prompt reads them. */
  text: string;
}

function frontmatter(source: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return { fields: {}, body: source };
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const f = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (f) fields[f[1]!] = f[2]!.trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: source.slice(m[0].length) };
}

/** The `.md` files under `dir` other than its SKILL.md, by path. */
function references(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((rel) => rel.endsWith(".md") && rel !== "SKILL.md" && statSync(path.join(dir, rel)).isFile())
    .sort();
}

function load(name: string): LoadedStyle | null {
  const dir = path.join(DIR, name);
  let source: string;
  try {
    source = readFileSync(path.join(dir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const { fields, body } = frontmatter(source);
  const parts = [body.trim(), ...references(dir).map((rel) => `## Reference: ${rel}\n\n${readFileSync(path.join(dir, rel), "utf8").trim()}`)];
  const text = parts.filter(Boolean).join("\n\n");
  return { name, description: fields.description ?? "", hash: createHash("sha256").update(text).digest("hex").slice(0, 16), text };
}

/** Every style, by name. Read from disk each time: a style added by a release shows without a restart. */
export function essayStyles(): LoadedStyle[] {
  let names: string[];
  try {
    names = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && NAME.test(d.name)).map((d) => d.name).sort();
  } catch {
    return [];
  }
  return names.flatMap((n) => load(n) ?? []);
}

export function essayStyle(name: string): LoadedStyle | null {
  return NAME.test(name) ? load(name) : null;
}

/** The style a new essay starts with. */
export const DEFAULT_STYLE = "plain";
