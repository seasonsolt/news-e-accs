-- 视频号版「AI 早报」的口播稿，按那天的日报存一行：后台点「生成口播稿」后由 worker 用模型写，编辑可以在工作台里改；
-- 本机的 scripts/wechat-video.ts 凭 WECHAT_VIDEO_TOKEN 读它合成视频。request 每次生成换一个，worker 只认最新的；
-- script 是 { opening, segments: [{ key, narration }], closing, caption }，重新生成时整份换掉。
CREATE TABLE IF NOT EXISTS wechat_videos (
  report_key    text PRIMARY KEY,
  status        text NOT NULL,
  request       text NOT NULL,
  script        jsonb,
  error         text,
  model         text,
  receipt_id    bigint,
  requested_by  text,
  edited_by     text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
