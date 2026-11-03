import { hasAlternateEdition } from "../lib/edition-meta.server";
import type { Route } from "./+types/item-original";
import type { SiteItemDetail } from "@aihot/contracts/site";
import { cachedPage, loadOr404 } from "../lib/api.server";
import { loadFollowups } from "../features/item/followups.server";
import { pageReuse } from "../lib/page-reuse";
export { default, headers, meta } from "./item";

export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();
export async function loader({ params, request }: Route.LoaderArgs) {
  const item = await loadOr404<SiteItemDetail>(`/api/site/items/${encodeURIComponent(params.id)}/original`, { request, signal: request.signal });
  return cachedPage(600, { item, followups: await loadFollowups(item, request), alternateEdition: await hasAlternateEdition(`/api/site/items/${encodeURIComponent(params.id)}/original`, item, request) });
}
