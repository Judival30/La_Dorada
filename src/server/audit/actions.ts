/**
 * Closed catalogue of `AuditLog.action` values. Add new actions here; the
 * `AuditEntry.action` type rejects free-form strings.
 */
export const AUDIT_ACTIONS = [
  // Auth (M1)
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  // Demo data (M1)
  'SEED_LOADED',
  // Confidential data room, spec R2 / §6 (M4)
  'ACCESS_DENIED',
  'DOCUMENT_DOWNLOADED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
