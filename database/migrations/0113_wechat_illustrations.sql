-- 公众号栏目「AI 早报」每条的配图，按那天的日报和条目各存一张：后台点「生成配图」后由 worker 用服务器上的 codex 画，
-- 或由编辑上传。图片文件在 AIHOT_DATA_DIR/uploads/wechat-illustrations/<file>；重画时旧图留到新图画好。
-- request 每次画或上传换一个，worker 只认最新的；wechat_url 是这张图传到公众号后的地址，换图时清空。
CREATE TABLE IF NOT EXISTS wechat_illustrations (
  report_key    text NOT NULL,
  entry_key     text NOT NULL,
  status        text NOT NULL,
  origin        text NOT NULL,
  prompt        text,
  request       text NOT NULL,
  file          text,
  error         text,
  receipt_id    bigint,
  wechat_url    text,
  requested_by  text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_key, entry_key)
);
