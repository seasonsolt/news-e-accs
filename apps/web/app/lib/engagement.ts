// Anonymous interaction counts. The browser reports an allowlisted name and, where needed, an item
// id or a source domain. Nothing here identifies a reader, and a failed send never affects the page.

/** Reports one interaction, sent the same way as page views. No-op during SSR. */
export function recordEngagement(event: string, target = ""): void {
  if (typeof window === "undefined") return;
  void fetch("/api/site/events", {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, target }),
  }).catch(() => {});
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

/** Handlers for a link to a source. A middle click opens it too, but fires auxclick instead of click. */
export function outboundLink(url: string) {
  const record = () => recordEngagement("outbound_click", sourceDomain(url));
  return { onClick: record, onAuxClick: (e: { button: number }) => { if (e.button === 1) record(); } };
}
