-- 验证 0108 的约束：只读扫描 admin_sessions，不阻塞读写。
ALTER TABLE admin_sessions VALIDATE CONSTRAINT admin_sessions_auth_method_check;
