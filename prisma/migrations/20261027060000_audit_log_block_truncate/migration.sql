-- R6 hardening: TRUNCATE on AuditLog also raises (statement-level trigger).
-- `prisma migrate reset` is unaffected: it drops the whole schema, which does
-- not fire TRUNCATE triggers. Integration tests clear the table by running
-- `SET LOCAL session_replication_role = replica` (superuser) before TRUNCATE,
-- which disables ordinary (ENABLE) triggers, including TRUNCATE ones.

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
