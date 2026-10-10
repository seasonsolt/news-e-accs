import { localeFromMatches, useTranslate } from "../lib/i18n";
import { POLICY, SITE } from "@aihot/site";
import copy from "@aihot/site/pages/terms.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import { webModules } from "../site-modules";

const TERMS = prepareCopy(copy);

export function headers() {
  return edgeTtl(300);
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ contentLocale: "zh", alternates: false, title: POLICY.terms.name, description: POLICY.terms.description, path: "/terms", image: "/og/pages/terms.png" }, localeFromMatches(matches ?? []));
}

export default function TermsPage() {
  const tx = useTranslate();
  return (
    <CopyPage
      doc={TERMS.doc}
      rendered={TERMS.rendered}
      eyebrow={SITE.name}
      footer={
        <LegalFooterLinks
          links={[
            { to: "/privacy", label: tx("隐私说明") },
            { to: "/agent", label: tx("Agent 接入页") },
            ...webModules().flatMap((m) => m.termsLinks ?? []),
          ]}
          note={`${tx(POLICY.terms.name)} ${TERMS.doc.meta["版本"] ?? ""} · ${TERMS.doc.meta["生效日期"] ?? ""}`}
        />
      }
    />
  );
}
