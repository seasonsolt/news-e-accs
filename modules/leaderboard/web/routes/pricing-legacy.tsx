import { redirect } from "react-router";
import { localePath, requestLocale } from "@aihot/web/lib/locale";
import { ApiError, apiErrorResponse, apiGet } from "@aihot/web/lib/api.server";

// The retired e-acc.ai Pages site's /pricing/<slug> pages, mapped to the leaderboard's model slugs.
const LEGACY_SLUGS: Record<string, string | null> = {
  "gpt-5-6-sol": "gpt-5-6-sol",
  "gpt-5-6-terra": "gpt-5-6-terra",
  "gpt-5-6-luna": "gpt-5-6-luna",
  "gpt-5-5": "gpt-5-5",
  "gpt-5-4-nano": "gpt-5-4-nano-2026-03-17",
  "claude-fable-5": "claude-fable-5",
  "claude-fable-5-1": "claude-fable-5-1",
  "claude-opus-4-8": "claude-opus-4-8",
  "claude-sonnet-5": "claude-sonnet-5",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3-7-flash": "gemini-3-7-flash",
  "gemini-2-5-flash": null,
  "deepseek-v4-pro": "deepseek-v-4-pro-20260813",
  "deepseek-v4-flash": "deepseek-v-4-1-flash",
  "kimi-k3": "kimi-k-3",
  "grok-4-5": "grok-4-5",
  "grok-4-6": "grok-4-6",
};

/** Whether the model currently has a leaderboard page (the model endpoint answers 404 otherwise). */
async function hasPage(slug: string, request: Request): Promise<boolean> {
  try {
    await apiGet(`/api/site/leaderboard/models/${encodeURIComponent(slug)}`, { request, signal: request.signal });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return false;
    throw apiErrorResponse(error, { request, signal: request.signal });
  }
}

/** A model with a page of its own gets it (301); every other retired address lands on the pricing table. */
export async function loader({ params, request }: { params: { slug?: string }; request: Request }) {
  const slug = params.slug ?? "";
  if (!Object.hasOwn(LEGACY_SLUGS, slug)) throw new Response("Not found", { status: 404 });
  const target = LEGACY_SLUGS[slug];
  const locale = requestLocale(request);
  if (target && (await hasPage(target, request))) throw redirect(localePath(`/leaderboard/${target}`, locale), 301);
  throw redirect(localePath("/pricing", locale), 301);
}

export default function LegacyPricingPage() {
  return null;
}
