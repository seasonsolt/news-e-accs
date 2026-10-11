-- 允许 Cloudflare Access 会话（auth_method = 'access'）；已有的行由下一个迁移验证。
ALTER TABLE admin_sessions ADD CONSTRAINT admin_sessions_auth_method_check CHECK (auth_method IN ('password', 'feishu', 'access')) NOT VALID;
