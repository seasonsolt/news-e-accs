// What the essays module's api answers and its pages read (api/*.ts, web/*.tsx).

export type EssayLanguage = "en" | "zh";
export const ESSAY_LANGUAGES: readonly EssayLanguage[] = ["en", "zh"];

/** One language of an essay. `body` is the Markdown subset described in backend/render.ts. */
export interface EssayEdition {
  title: string;
  /** The line under the title. */
  dek: string;
  /** The search snippet (meta description), about 150 characters. */
  description: string;
  body: string;
}

export type EssayStatus = "draft" | "published" | "withdrawn";
export type EssayTaskKind = "outline" | "draft" | "revise" | "localize" | "search" | "draw";
export type EssayTaskStatus = "queued" | "running" | "done" | "failed" | "accepted" | "discarded";
/** `cover`, or an inline figure the body places with a `[[figure-N]]` line. */
export type EssaySlot = "cover" | `figure-${number}`;

export interface EssayTask {
  id: number;
  kind: EssayTaskKind;
  status: EssayTaskStatus;
  /** revise: { language, section, instruction }; search/draw: { slot }. */
  input: { language?: EssayLanguage; section?: number; instruction?: string; slot?: string };
  /** revise: the proposed section, to accept or discard; search: how many candidates were found. */
  result: { text?: string; base?: string; found?: number } | null;
  error: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EssayImageCandidate {
  file: string;
  /** The page the picture is from. */
  page: string;
}

export interface EssayImage {
  slot: string;
  /** What the picture should show: the search subject and the drawing's instruction. */
  prompt: string;
  alt: Partial<Record<EssayLanguage, string>>;
  file: string | null;
  width: number | null;
  height: number | null;
  origin: "search" | "drawn" | "uploaded" | null;
  /** The page a found picture is from, printed under it. */
  credit: string | null;
  candidates: EssayImageCandidate[];
}

export interface EssayStyle {
  name: string;
  description: string;
  /** Content fingerprint: a revision records which wording of the style wrote it. */
  hash: string;
}

export interface EssayRevision {
  id: number;
  part: "outline" | EssayLanguage;
  source: "outline" | "draft" | "revise" | "localize" | "manual";
  style: string | null;
  createdBy: string;
  createdAt: string;
}

export interface EssayDetail {
  id: number;
  slug: string;
  /** The slug is fixed once the essay has been published. */
  slugLocked: boolean;
  status: EssayStatus;
  style: string;
  fragments: string;
  /** Site pages (paths or addresses) the worker reads as citable material. */
  refs: string[];
  outline: string;
  editions: Record<EssayLanguage, EssayEdition>;
  images: EssayImage[];
  version: number;
  tasks: EssayTask[];
  revisions: EssayRevision[];
  /** What stops publishing now; empty when it can be published. */
  problems: string[];
  /** The live publication, if any. */
  live: { publishedAt: string; modifiedAt: string; path: string } | null;
  /** Why the worker cannot write (model calls off), or null. */
  writingUnavailable: string | null;
  /** Why the worker cannot search or draw pictures (no Codex CLI, or model calls off), or null. */
  picturesUnavailable: string | null;
  styles: EssayStyle[];
  createdAt: string;
  updatedAt: string;
}

export interface EssayListEntry {
  id: number;
  slug: string;
  status: EssayStatus;
  title: string;
  /** The kind of the task now queued or running, if any. */
  working: EssayTaskKind | null;
  failed: number;
  updatedAt: string;
  publishedAt: string | null;
}

export interface EssayList {
  essays: EssayListEntry[];
  styles: EssayStyle[];
}

/** A save: only the fields given change. `version` must be the one the editor loaded. */
export interface EssaySave {
  version: number;
  slug?: string;
  style?: string;
  fragments?: string;
  refs?: string[];
  outline?: string;
  editions?: Partial<Record<EssayLanguage, EssayEdition>>;
}

/** A picture slot's words, saved on their own: the worker never writes them while it finds or draws. */
export interface EssayImageSave {
  prompt?: string;
  alt?: Partial<Record<EssayLanguage, string>>;
}

export interface EssayTaskRequest {
  kind: EssayTaskKind;
  language?: EssayLanguage;
  section?: number;
  instruction?: string;
  slot?: string;
}

// Public reads (/api/site/essays…), one language at a time.

export interface PublicEssayImage {
  src: string;
  width: number;
  height: number;
  alt: string;
  credit: string | null;
}

export interface PublicEssaySummary {
  slug: string;
  path: string;
  title: string;
  dek: string;
  cover: PublicEssayImage;
  publishedAt: string;
  modifiedAt: string;
}

export interface PublicEssay extends PublicEssaySummary {
  language: EssayLanguage;
  description: string;
  /** Sanitized HTML of the body, figures included. */
  html: string;
  wordCount: number;
  author: { name: string; path: string };
  /** The 1200×630 picture for link previews. */
  card: string;
  /** The page in the other language. */
  alternate: string;
}

export interface PublicEssayList {
  essays: PublicEssaySummary[];
}

/** The address of a public essay page. */
export const essayPath = (slug: string, language: EssayLanguage) => `${language === "zh" ? "/zh" : ""}/essays/${slug}`;
export const ESSAYS_PATH = "/essays";
export const ESSAY_MEDIA = "/essays/media";
export const essayFeedPath = (language: EssayLanguage) => (language === "zh" ? "/feed/zh/essays.xml" : "/feed/essays.xml");
