-- 公众号栏目「AI 早报」每一期在工作台里的改动（排序、隐藏、改写的文字、主题），按那天的日报存一行；
-- revision 每保存一次加一，防止两个窗口互相覆盖。
CREATE TABLE IF NOT EXISTS wechat_issues (
  report_key  text PRIMARY KEY,
  edits       jsonb NOT NULL DEFAULT '{}',
  revision    integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
