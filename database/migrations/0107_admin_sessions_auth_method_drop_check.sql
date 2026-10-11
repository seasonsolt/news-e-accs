-- 管理员会话也可以来自 Cloudflare Access：先去掉只允许 password、feishu 的约束，下一个迁移换成新的。
ALTER TABLE admin_sessions DROP CONSTRAINT IF EXISTS admin_sessions_auth_method_check;
