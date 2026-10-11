-- 这一期最近一次推送到公众号草稿箱的记录：草稿和封面的 media_id、封面的内容指纹、推送时间、推送时的 revision 和推送人。
ALTER TABLE wechat_issues ADD COLUMN IF NOT EXISTS push jsonb;
