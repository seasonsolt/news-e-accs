import { localeFromMatches, useTranslate } from "../lib/i18n";
import { POLICY, SITE } from "@aihot/site";
import copy from "@aihot/site/pages/privacy.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";

const PRIVACY = prepareCopy(copy);

export function headers() {
  return edgeTtl(300);
}

export function meta({ matches }: { matches?: Array<{ id: string; data?: unknown }> } = {}) {
  return pageMeta({ contentLocale: "zh", alternates: false, title: "隐私说明", description: POLICY.privacy.description, path: "/privacy", image: "/og/pages/privacy.png" }, localeFromMatches(matches ?? []));
}

export default function PrivacyPage() {
  const tx = useTranslate();
  return (
    <CopyPage
      doc={PRIVACY.doc}
      rendered={PRIVACY.rendered}
      eyebrow={SITE.name}
      footer={<LegalFooterLinks links={[{ to: "/terms", label: tx(POLICY.terms.name) }, { to: "/feedback", label: tx("反馈页") }]} note={tx("隐私说明 {0} · {1}", PRIVACY.doc.meta["版本"] ?? "", PRIVACY.doc.meta["生效日期"] ?? "")} />}
    />
  );
}
