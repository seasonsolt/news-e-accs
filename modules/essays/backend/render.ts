// The essay body: a subset of Markdown the author edits and the models write, rendered here to the HTML
// the public page prints and the admin previews.
//   ## Heading / ### Subheading       sections (a `##` line starts a section the worker can rewrite alone)
//   paragraphs, **bold**, *italic*, [links](https://… or /path), > quotes, - and 1. lists, ---
//   !! A sentence                       the section's thesis, set large
//   [[figure-1]]                        on its own line: the picture in slot figure-1
//   [[check: …]]                        a claim the author still has to check; blocks publishing
// Anything else HTML-like is removed.
import * as cheerio from "cheerio";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { EssayEdition, EssayLanguage } from "../contracts.ts";

export interface FigureImage {
  file: string;
  width: number;
  height: number;
  alt: string;
  credit: string | null;
}

const FIGURE_LINE = /^\[\[(figure-[1-9])\]\]$/;
const FIGURE_ANY = /\[\[(figure-[1-9])\]\]/g;
const CHECK = /\[\[check:/i;

/** The figure slots a body places, in order, each once. */
export function figureSlots(body: string): string[] {
  return [...new Set([...body.matchAll(FIGURE_ANY)].map((m) => m[1]!))];
}

export function hasCheck(edition: EssayEdition): boolean {
  return [edition.title, edition.dek, edition.description, edition.body].some((t) => CHECK.test(t));
}

/** The body cut at its `## ` lines: [intro, section 1, …]. Joining them gives the body back. */
export function sections(body: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const line of body.split("\n")) {
    if (/^## /.test(line) && (current.length || out.length)) {
      out.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  out.push(current.join("\n"));
  return out;
}

export function joinSections(parts: string[]): string {
  return parts.join("\n");
}

/** Words for English, characters for Chinese: what the reader's eye counts. */
export function wordCount(body: string, language: EssayLanguage): number {
  const text = body.replace(/\[\[[^\]]*\]\]/g, " ").replace(/[#>*_`!\-[\]()]/g, " ");
  if (language === "zh") return (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length + (text.match(/[A-Za-z0-9]+/g) ?? []).length;
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: ["p", "h2", "h3", "blockquote", "ul", "ol", "li", "em", "strong", "a", "hr", "br", "code"],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: ["https", "http"],
  allowProtocolRelative: false,
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * The body as HTML. `media` is where picture files are served from (public or admin); `figures` holds the
 * pictures by slot. A figure without a picture is left as a marked gap (the preview shows it; publishing
 * refuses it).
 */
export function renderBody(body: string, opts: { media: string; figures: Record<string, FigureImage>; language: EssayLanguage }): string {
  // A figure line stands alone, so it is its own paragraph to replace.
  const source = body.replace(/\r\n/g, "\n").split("\n").map((line) => (FIGURE_LINE.test(line.trim()) ? `\n${line.trim()}\n` : line)).join("\n");
  const html = sanitizeHtml(marked.parse(source, { async: false, gfm: true, breaks: false }), ALLOWED);
  const $ = cheerio.load(html, null, false);
  $("a").each((_, el) => {
    const a = $(el);
    const href = a.attr("href") ?? "";
    if (!/^https?:\/\//.test(href) && !href.startsWith("/")) a.removeAttr("href");
    else if (/^https?:\/\//.test(href)) a.attr("rel", "noopener");
  });
  $("p").each((_, el) => {
    const p = $(el);
    const text = p.text().trim();
    const figure = FIGURE_LINE.exec(text);
    if (figure) {
      const image = opts.figures[figure[1]!];
      if (!image) {
        p.replaceWith(`<div class="essay-figure-missing" data-slot="${figure[1]}">${figure[1]}</div>`);
        return;
      }
      const img = $("<img>").attr({ src: `${opts.media}/${image.file}`, width: String(image.width), height: String(image.height), alt: image.alt, loading: "lazy", decoding: "async" });
      const out = $(`<figure class="essay-figure"></figure>`).append(img);
      if (image.credit) {
        const caption = $("<figcaption></figcaption>").text(opts.language === "zh" ? "图片来源：" : "Image: ");
        caption.append($("<a></a>").attr({ href: image.credit, rel: "noopener" }).text(host(image.credit)));
        out.append(caption);
      }
      p.replaceWith(out);
      return;
    }
    const first = p.contents().first();
    if (first.length && first[0]!.type === "text" && /^!!\s/.test(first.text())) {
      first.replaceWith(first.text().replace(/^!!\s+/, ""));
      p.addClass("essay-thesis");
    }
  });
  // A check left in the text is shown to the author, never silently printed as prose.
  const out = $.html().replace(/\[\[check:([^\]]*)\]\]/gi, (_m, note: string) => `<mark class="essay-check">${note.trim()}</mark>`);
  return out;
}

/** A URL-safe slug from a title; empty when nothing is left. */
export function slugify(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 10).join("-").slice(0, 80).replace(/-+$/, "");
}

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An edition as stored, with every field a string. */
export function edition(value: unknown): EssayEdition {
  const v = (value ?? {}) as Partial<Record<keyof EssayEdition, unknown>>;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return { title: s(v.title), dek: s(v.dek), description: s(v.description), body: s(v.body) };
}
