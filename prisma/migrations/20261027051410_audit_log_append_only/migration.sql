-- R6: AuditLog is append-only. Any UPDATE or DELETE raises.
--
-- TRUNCATE is intentionally NOT blocked: it is only used by the integration
-- test reset and by `prisma migrate reset` (which drops the whole schema).
-- Application code never issues TRUNCATE. Tests that need to tamper with a
-- row bypass this trigger with `SET session_replication_role = replica`
-- (superuser only, scoped to that connection).

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
