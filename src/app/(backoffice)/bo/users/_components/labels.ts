import type { ChipTone } from '@/components/ld/status-chip';
import type { UserStatus } from '@/domain/machines/user';
import type { ReviewStatus } from '@/domain/onboarding';

export const STATUS_LABEL: Record<UserStatus, string> = {
  PENDING: 'Registro incompleto',
  IN_REVIEW: 'En revisión',
  CORRECTIONS_REQUESTED: 'Con correcciones',
  ENABLED: 'Habilitado',
  REJECTED: 'Rechazado',
  BLOCKED: 'Bloqueado',
};

export const STATUS_TONE: Record<UserStatus, ChipTone> = {
  PENDING: 'neutral',
  IN_REVIEW: 'info',
  CORRECTIONS_REQUESTED: 'warning',
  ENABLED: 'success',
  REJECTED: 'danger',
  BLOCKED: 'danger',
};

export const DOC_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};

export const DOC_STATUS_TONE: Record<ReviewStatus, ChipTone> = {
  PENDING: 'neutral',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const ROLE_NAME: Record<'BUYER' | 'SELLER', string> = {
  BUYER: 'Comprador',
  SELLER: 'Vendedor',
};

const ACTION_LABEL: Record<string, string> = {
  USER_REGISTERED: 'Se registró',
  ONBOARDING_STEP_SAVED: 'Guardó un paso del registro',
  VERIFICATION_DOCUMENT_UPLOADED: 'Subió un documento',
  VERIFICATION_DOCUMENT_DELETED: 'Eliminó un documento',
  VERIFICATION_DOCUMENT_VIEWED: 'Abrió un documento',
  ONBOARDING_SUBMITTED: 'Envió el registro a revisión',
  VERIFICATION_DOCUMENT_REVIEWED: 'Revisó un documento',
  KYC_ITEM_CHECKED: 'Actualizó el checklist KYC',
  KYC_SCREENING_RUN: 'Consultó listas restrictivas',
  USER_APPROVED: 'Aprobó el registro',
  USER_CORRECTIONS_REQUESTED: 'Solicitó correcciones',
  USER_REJECTED: 'Rechazó el registro',
  USER_BLOCKED: 'Bloqueó la cuenta',
  USER_UNBLOCKED: 'Desbloqueó la cuenta',
  LOGIN_SUCCEEDED: 'Inició sesión',
  LOGIN_FAILED: 'Intento de inicio de sesión fallido',
  LOGOUT: 'Cerró sesión',
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? 'Actividad en la cuenta';
}

const DATE = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Bogota',
});
const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
});

export const formatDay = (d: Date): string => DATE.format(d);
export const formatDateTime = (d: Date): string => DATE_TIME.format(d);

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

export const DECISION_LABEL: Record<string, string> = {
  APPROVE: 'Aprobó el registro',
  REQUEST_CORRECTIONS: 'Solicitó correcciones',
  REJECT: 'Rechazó el registro',
  BLOCK: 'Bloqueó la cuenta',
  UNBLOCK: 'Desbloqueó la cuenta',
  SUSPEND: 'Suspendió',
  REINSTATE: 'Reactivó',
};
