-- 公众号栏目「AI 早报」每一期的主题分组和跟进说明，按那天的日报存一行（worker 写，后台导出时读）：
-- topics 是 [{title, entries: [条目 key]}]，标题是一句判断；followups 是 {条目 key: 这次比上次新在哪}。
CREATE TABLE IF NOT EXISTS wechat_topics (
  report_key  text PRIMARY KEY,
  topics      jsonb NOT NULL,
  followups   jsonb NOT NULL,
  model       text NOT NULL,
  receipt_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);
