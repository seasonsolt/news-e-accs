// Anonymous interaction counts. The browser reports an allowlisted name and, where needed, an item
// id or a source domain. Nothing here identifies a reader, and a failed send never affects the page.

const ENDPOINT = "/api/site/events";

/** Reports one interaction. No-op during SSR and when the browser cannot send. */
export function recordEngagement(event: string, target = ""): void {
  if (typeof window === "undefined") return;
  let body: string;
  try {
    body = JSON.stringify({ event, target });
  } catch {
    return;
  }
  try {
    const beacon = window.navigator?.sendBeacon;
    if (typeof beacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (beacon.call(window.navigator, ENDPOINT, blob)) return;
    }
  } catch {
    // The fetch below is the fallback.
  }
  const send = window.fetch;
  if (typeof send !== "function") return;
  try {
    void Promise.resolve(send.call(window, ENDPOINT, {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body,
    })).catch(() => {});
  } catch {
    // Fire-and-forget.
  }
}

/** Host of an outbound source link, or empty when it cannot be read. The server checks it again. */
export function sourceDomain(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function recordOutboundClick(url: string): void {
  recordEngagement("outbound_click", sourceDomain(url));
}
