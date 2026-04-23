DROP TRIGGER IF EXISTS trg_auth_sessions_set_updated_at ON auth_sessions;
DROP TRIGGER IF EXISTS trg_resumes_set_updated_at ON resumes;
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS auth_sessions;
DROP TABLE IF EXISTS resume_versions;
DROP TABLE IF EXISTS resumes;
DROP TABLE IF EXISTS users;

DROP FUNCTION IF EXISTS set_updated_at();
