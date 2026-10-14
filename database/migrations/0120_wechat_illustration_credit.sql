-- 配图的出处：从原文或网上找来的图，记下它所在网页的地址，文章里在图下注明来源；画的和上传的为空。
ALTER TABLE wechat_illustrations ADD COLUMN IF NOT EXISTS credit text;
