import { readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";

export const FONT_DIR = path.join(REPO_ROOT, "assets/og-fonts");

/**
 * Fonts a site adds beside Noto Sans SC for the characters its subset lacks (traditional and Japanese
 * kanji, kana, Hangul, accented Latin): `<name>-400.ttf` and `<name>-700.ttf` in assets/og-fonts. satori
 * takes a glyph the first font has no outline for from the next one, so they come after Noto Sans SC.
 */
export function fallbackFontFiles(files: string[]): string[] {
  return files.filter((f) => /^.+-(400|700)\.ttf$/.test(f) && !f.startsWith("noto-sans-sc-")).sort();
}

/** None by default: the share images and their cache keys are then what they were without this. */
export const FALLBACK_FONTS = fallbackFontFiles(readdirSync(FONT_DIR));
