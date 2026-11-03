// Cache identity and card data shared by API readers and worker renderers; no fonts or native codecs.
import { FALLBACK_FONTS } from "./fonts.ts";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WechatTheme } from "../newsletter/wechat.ts";
import { config } from "../config.ts";
export const OG_TEMPLATE_VERSION = "og-2026-09-29.eacc1";
export const POSTER_TEMPLATE_VERSION = "poster-2026-10-10.editions";
export interface OgCard {
  kicker: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  /** Small emphasised figure on the right (e.g. an item score). */
  badge?: { value: string; label: string } | null;
  accent?: "teal" | "hot" | "amber";
}

export interface Poster {
  language?: "en" | "zh";
  url: string;
  kicker: string;
  title: string;
  summary: string | null;
  source: string;
  date: string;
  score: number | null;
}

export function ogEtag(card: OgCard): string {
  return createHash("sha256").update(OG_TEMPLATE_VERSION).update(FALLBACK_FONTS.join()).update(JSON.stringify(card)).digest("hex").slice(0, 24);
}

export function posterEtag(p: Poster): string {
  return createHash("sha256").update(POSTER_TEMPLATE_VERSION).update(FALLBACK_FONTS.join()).update(JSON.stringify(p)).digest("hex").slice(0, 24);
}

export function readCardPng(name: string): Promise<Buffer | null> {
  return readFile(path.join(config.dataDir, "ogcache", `${name}.png`)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

export const WECHAT_COVER_TEMPLATE_VERSION = "wechat-cover-2026-10-12.1";
export const WECHAT_COVER = { width: 1175, height: 500 } as const;
/** The left square as the draft API's crop fractions (x1_y1_x2_y2). */
export const WECHAT_COVER_SQUARE = `0_0_${(WECHAT_COVER.height / WECHAT_COVER.width).toFixed(6)}_1`;
export const WECHAT_COVER_WIDE = "0_0_1_1";

export interface WechatCover {
  date: string;
  issueNumber: number;
  headline: string;
  theme: WechatTheme;
}

export function wechatCoverEtag(cover: WechatCover): string {
  return createHash("sha256").update(WECHAT_COVER_TEMPLATE_VERSION).update(JSON.stringify(cover)).digest("hex").slice(0, 24);
}
