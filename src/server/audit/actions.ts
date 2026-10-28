/**
 * Closed catalogue of `AuditLog.action` values. Add new actions here; the
 * `AuditEntry.action` type rejects free-form strings.
 */
export const AUDIT_ACTIONS = [
  // Auth (M1)
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'LOGOUT',
  // Onboarding (M2)
  'USER_REGISTERED',
  'ONBOARDING_STEP_SAVED',
  'VERIFICATION_DOCUMENT_UPLOADED',
  'VERIFICATION_DOCUMENT_DELETED',
  'VERIFICATION_DOCUMENT_VIEWED',
  'ONBOARDING_SUBMITTED',
  // Back Office user review (M2)
  'VERIFICATION_DOCUMENT_REVIEWED',
  'KYC_ITEM_CHECKED',
  'KYC_SCREENING_RUN',
  'USER_APPROVED',
  'USER_CORRECTIONS_REQUESTED',
  'USER_REJECTED',
  'USER_BLOCKED',
  'USER_UNBLOCKED',
  // Back Office opportunity evaluation (M3)
  'EVALUATION_UPDATED',
  'OPPORTUNITY_APPROVED',
  'OPPORTUNITY_ADJUSTMENTS_REQUESTED',
  'OPPORTUNITY_REJECTED',
  // Demo data (M1)
  'SEED_LOADED',
  // Confidential data room, spec R2 / §6 (M4)
  'ACCESS_DENIED',
  'DOCUMENT_DOWNLOADED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
