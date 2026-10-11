-- 公众号栏目「AI 早报」每条的一句点评，按那天的日报和条目各存一条（worker 写，后台导出时读）。
CREATE TABLE IF NOT EXISTS wechat_comments (
  report_key  text NOT NULL,
  item_id     text NOT NULL,
  comment     text NOT NULL,
  model       text NOT NULL,
  receipt_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_key, item_id)
);
