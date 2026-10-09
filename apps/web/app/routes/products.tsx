import { localeFromMatches, useLocale } from "../lib/i18n";
import { PRODUCTS } from "@aihot/industry/products";
import { Deck } from "../components/shell/Deck";
import { pageMeta } from "../lib/seo";

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ title: "产品目录", description: "e/acc 的公开产品与开源项目。", path: "/products" }, localeFromMatches(matches ?? []));
}
export default function Products() {
  const locale = useLocale();
  return <>
    <Deck compact label={locale === "en" ? "Products" : "产品目录"}
      title={locale === "en" ? "Built to accelerate." : "为加速而创造。"}
      description={locale === "en" ? "Public products and open-source projects from e/acc." : "e/acc 的公开产品与开源项目。"} />
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PRODUCTS.map((product) => <article key={product.slug} className="card flex flex-col p-5">
        <p className="text-[12px] text-ink-4">{product.kind[locale]}</p>
        <h2 className="mt-2 text-[22px] font-bold">{product.name}</h2>
        <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ink-3">{product.description[locale]}</p>
        <div className="mt-5 flex gap-4 text-[14px] text-accent">
          <a href={product.href} target="_blank" rel="noopener noreferrer">{locale === "en" ? "Explore ↗" : "了解项目 ↗"}</a>
          {"repository" in product && product.repository && product.repository !== product.href && <a href={product.repository} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
        </div>
      </article>)}
    </div>
  </>;
}
