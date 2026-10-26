// Configuration fields the engine reads from each edition's own site package.
export type ModelPreset = HttpPreset | CodexPreset;

export interface HttpPreset {
  transport?: "http";
  service: string;
  model: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
  /** Extra request fields, e.g. switching reasoning off for short structured tasks. */
  extra?: Record<string, unknown>;
  /** Output tokens added to every call's own limit for a reasoning model, which reasons before it answers. */
  reasoningTokens?: number;
  jsonMode: boolean;
  vision?: boolean;
  /** Capability → primary model for which this preset is an evaluated backup. */
  fallbackFor?: Record<string, string>;
  /** The score step's call parameters with this model, instead of the step's own (editorial/analyze.ts). */
  scoreCall?: { temperature: number; maxTokens: number; timeoutMs: number };
}

export interface CodexPreset {
  transport: "codex";
  service: string;
  model: string;
  reasoningEffort?: string;
  jsonMode: boolean;
  vision?: false;
  fallbackFor?: Record<string, string>;
  scoreCall?: { temperature: number; maxTokens: number; timeoutMs: number };
}

/** The optional founder shown in the site's structured metadata. */
export interface Founder {
  name: string;
  alternateName?: string;
  jobTitle?: string;
  description?: string;
  url?: string;
  sameAs?: string[];
}
