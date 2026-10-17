// The newsletter form's one request, and the anonymous funnel counts that go with it.
// Double opt-in is unchanged: 202 means a confirmation letter was accepted, not that the reader is subscribed.
import { subscribeErrorReason, subscribeEventTarget, type SubscribeErrorReason, type SubscribeFunnelEvent, type SubscribeLocale, type SubscribeSource } from "@aihot/contracts/subscribe";
import { recordEngagement } from "../../lib/engagement";
import type { Locale } from "../../lib/locale";

export interface SubscribeFailure {
  detail: string;
  reason: SubscribeErrorReason;
}

/** One funnel count. The target is source, locale and maybe a reason — never the address. */
export function recordSubscribe(event: SubscribeFunnelEvent, source: SubscribeSource, locale: Locale, reason: SubscribeErrorReason | "" = ""): void {
  const target = subscribeEventTarget(event, { source, locale: locale as SubscribeLocale, reason });
  if (target) recordEngagement(event, target);
}

async function post(path: string, body: Record<string, string>): Promise<{ status: number; problem: { detail?: unknown; retryAfter?: unknown } }> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const problem = res.ok ? {} : await res.json().catch(() => ({}));
  return { status: res.status, problem };
}

function failure(status: number, problem: { detail?: unknown; retryAfter?: unknown }, fallback: string): SubscribeFailure {
  return { detail: typeof problem.detail === "string" ? problem.detail : fallback, reason: subscribeErrorReason(status, problem) };
}

/** Accepts only 202. A network failure is `network`; the server's status maps to cap, 503, and the other reasons. */
export async function requestSubscribe(email: string, language: Locale): Promise<SubscribeFailure | null> {
  try {
    const { status, problem } = await post("/api/site/newsletter/subscribe", { email, language });
    if (status === 202) return null;
    return failure(status, problem, "暂时无法完成，请稍后再试。");
  } catch {
    return { detail: "网络好像断了，请稍后再试。", reason: "network" };
  }
}

export async function requestConfirm(token: string): Promise<SubscribeFailure | null> {
  try {
    const { status, problem } = await post("/api/site/newsletter/confirm", { token });
    if (status === 200) return null;
    return failure(status, problem, "暂时无法完成，请稍后再试。");
  } catch {
    return { detail: "网络好像断了，请稍后再试。", reason: "network" };
  }
}
