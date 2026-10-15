// X post text as the item page shows it.

/** Post text without its t.co short links, and how many there were. */
export function withoutShortLinks(text: string): { text: string; links: number } {
  let links = 0;
  const stripped = text.replace(/\s*https?:\/\/t\.co\/[A-Za-z0-9]+/g, () => { links += 1; return ""; }).replace(/[\s:：]+$/u, "").trim();
  return { text: stripped || text, links: stripped ? links : 0 };
}
