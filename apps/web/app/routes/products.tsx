import { localePath } from "../lib/locale";
import { localeFromMatches, useLocale } from "../lib/i18n";
import { PRODUCTS } from "@aihot/industry/products";
import { Deck } from "../components/shell/Deck";
import { Badge } from "../components/ui/Badge";
import { pageMeta } from "../lib/seo";

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "产品目录", description: "e/acc 即将发布的产品与项目。", path: "/products" }, localeFromMatches(matches ?? []));
}
export default function Products() {
  const locale = useLocale();
  return <>
    <Deck compact label={locale === "en" ? "Products" : "产品目录"}
      title={locale === "en" ? "Built to accelerate." : "为加速而创造。"}
      description={locale === "en" ? "Upcoming products and projects from e/acc." : "e/acc 即将发布的产品与项目。"} />
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PRODUCTS.map((product) => <article key={product.slug} className="card relative flex flex-col p-5">
        <div className="flex items-center gap-3">
          {product.logo
            ? <img src={product.logo} alt="" width={44} height={44} loading="lazy" decoding="async" className="size-11 shrink-0 rounded-[10px]" />
            : <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-bg-sunk text-[20px] font-bold text-ink-3">{product.name[0]}</span>}
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold leading-tight">{product.status === "live" && product.url ? <a href={localePath(product.url, locale)} className="after:absolute after:inset-0 after:rounded-xl">{product.name}</a> : product.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink-4">{product.kind[locale]}</p>
          </div>
        </div>
        <p className="mt-4 flex-1 text-[14px] leading-relaxed text-ink-3">{product.description[locale]}</p>
        <div className="mt-5"><Badge tone={product.status === "live" ? "ok" : "neutral"}>{product.status === "live" ? (locale === "en" ? "Available" : "已上架") : (locale === "en" ? "Coming soon" : "待发布")}</Badge></div>
      </article>)}
    </div>
  </>;
}
