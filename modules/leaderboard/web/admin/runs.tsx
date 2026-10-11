import { Text, useTranslate } from "@aihot/web/lib/i18n";
import { bj, num } from "@aihot/web/features/admin/format";
import { Badge, Card, DataTable, Time } from "@aihot/web/features/admin/ui";
import type { LbFetchOverview } from "../../contracts.ts";

export default function LeaderboardRuns({ data }: { data: unknown }) {
  const tx = useTranslate();
  const r = data as LbFetchOverview;
  return (
    <Card
      className="mt-5"
      title={tx("模型榜评测来源")}
      right={<span>{tx("最近抓取 {0} · 成功 {1}/{2}", bj(r.at), r.sources.filter((x) => x.ok).length, r.sources.length)}</span>}
      pad={false}
    >
      <div className="max-h-[360px] overflow-y-auto">
        <DataTable
          dense
          rows={r.sources}
          rowKey={(x) => x.key}
          columns={[
            { key: "k", label: tx("来源"), render: (x) => <span className="font-mono text-[12.5px]">{x.key}</span> },
            { key: "s", label: tx("上次抓取"), render: (x) => <Badge tone={x.ok ? "ok" : "bad"}><Text value={x.ok ? (x.changed ? "有更新" : "无变化") : "失败"} /></Badge> },
            { key: "ok", label: tx("上次成功"), render: (x) => <Time at={x.lastOkAt} /> },
            { key: "n", label: tx("行数"), align: "right", render: (x) => (x.rows == null ? "—" : num(x.rows)) },
            { key: "e", label: tx("错误"), render: (x) => <span className="line-clamp-1 text-[12px] text-ink-3" title={x.error ?? ""}>{x.error}</span> },
          ]}
        />
      </div>
    </Card>
  );
}
