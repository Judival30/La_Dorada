import type { ChipTone } from '@/components/ld/status-chip';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import { formatCOP } from '@/domain/money';

export const QUEUE_STATUSES = [
  'IN_REVIEW',
  'ADJUSTMENTS_REQUESTED',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
] as const satisfies readonly OpportunityStatus[];
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const OPP_STATUS_LABEL: Record<OpportunityStatus, string> = {
  DRAFT: 'Borrador',
  IN_REVIEW: 'En revisión',
  ADJUSTMENTS_REQUESTED: 'Ajustes solicitados',
  PUBLISHED: 'Publicada',
  REJECTED: 'Rechazada',
  SUSPENDED: 'Suspendida',
  WITHDRAWN_BY_SELLER: 'Retirada por el vendedor',
  CLOSED: 'Cerrada',
};

export const OPP_STATUS_TONE: Record<OpportunityStatus, ChipTone> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'info',
  ADJUSTMENTS_REQUESTED: 'warning',
  PUBLISHED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  WITHDRAWN_BY_SELLER: 'neutral',
  CLOSED: 'neutral',
};

export const OPP_DECISION_LABEL: Record<string, string> = {
  APPROVE: 'Aprobó y publicó la oportunidad',
  REQUEST_CORRECTIONS: 'Solicitó ajustes',
  REJECT: 'Rechazó la oportunidad',
  SUSPEND: 'Suspendió la oportunidad',
  REINSTATE: 'Reactivó la oportunidad',
};

export const BREAKDOWN_LABEL: Record<string, string> = {
  infoQuality: 'Calidad de información',
  consistency: 'Consistencia financiera',
  growth: 'Crecimiento',
  margin: 'Margen EBITDA',
  risks: 'Riesgos',
};

/** "COP 180.000 – 320.000 M": the unit is shown once. */
export function formatRange(low: bigint, high: bigint): string {
  const a = formatCOP(low);
  const b = formatCOP(high);
  return a.endsWith(' M') && b.endsWith(' M') ? `${a.slice(0, -2)} – ${b.slice(4)}` : `${a} – ${b}`;
}

/** `?estado=` of the queue: absent = IN_REVIEW, `todas` = no filter. */
export function parseStatusParam(v: string | string[] | undefined): QueueStatus | 'ALL' {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === 'todas') return 'ALL';
  return (QUEUE_STATUSES as readonly string[]).includes(s ?? '') ? (s as QueueStatus) : 'IN_REVIEW';
}

export function queueHref(status: QueueStatus | 'ALL'): string {
  if (status === 'ALL') return '/bo/companies?estado=todas';
  return status === 'IN_REVIEW' ? '/bo/companies' : `/bo/companies?estado=${status}`;
}
