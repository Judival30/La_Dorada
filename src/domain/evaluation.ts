/**
 * Back Office evaluation rules (slide13, spec §7). P3: the evaluation matrix
 * (`EvaluationItem`) is the single source for the score's qualitative inputs;
 * statuses are mapped to `MatrixStatus` / `RiskLevel` here.
 */
import { financialYearsIssue } from './company';
import { cagr, type MatrixStatus, type RiskLevel, type ScoreInput } from './valuation';

// Mirrors of Prisma enums (pinned by src/server/db/enums.test.ts).
export const EVALUATION_ITEM_KINDS = [
  'DOCUMENTARY',
  'FINANCIAL_CONSISTENCY',
  'CUSTOMER_DEPENDENCY',
  'LEGAL_CONTINGENCIES',
] as const;
export type EvaluationItemKind = (typeof EVALUATION_ITEM_KINDS)[number];

export const EVALUATION_ITEM_STATUSES = [
  'COMPLETED',
  'APPROVED',
  'MEDIUM_RISK',
  'TO_CLARIFY',
  'HIGH_RISK',
] as const;
export type EvaluationItemStatus = (typeof EVALUATION_ITEM_STATUSES)[number];

export const EVALUATION_ITEM_META: Record<
  EvaluationItemKind,
  { label: string; description: string; computed: boolean }
> = {
  DOCUMENTARY: {
    label: 'Verificación documental',
    description: 'Calculada: todas las carpetas requeridas del data room tienen documentos.',
    computed: true,
  },
  FINANCIAL_CONSISTENCY: {
    label: 'Consistencia financiera',
    description: 'Los estados financieros cuadran entre sí y con los soportes.',
    computed: false,
  },
  CUSTOMER_DEPENDENCY: {
    label: 'Dependencia de clientes',
    description: 'Concentración de ingresos en pocos clientes.',
    computed: false,
  },
  LEGAL_CONTINGENCIES: {
    label: 'Contingencias legales',
    description: 'Litigios, sanciones o pasivos contingentes relevantes.',
    computed: false,
  },
};

export const EVALUATION_ITEM_STATUS_META: Record<
  EvaluationItemStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  COMPLETED: { label: 'Completada', tone: 'success' },
  APPROVED: { label: 'Aprobada', tone: 'success' },
  MEDIUM_RISK: { label: 'Riesgo medio', tone: 'warning' },
  TO_CLARIFY: { label: 'Por aclarar', tone: 'danger' },
  HIGH_RISK: { label: 'Riesgo alto', tone: 'danger' },
};

/** Standard data room folders; the first six are required for evaluation. */
export const DATA_ROOM_FOLDERS: readonly { name: string; required: boolean; position: number }[] = [
  'Estados financieros',
  'Declaraciones tributarias',
  'Contratos',
  'Clientes',
  'Proveedores',
  'Capex y activos fijos',
  'Litigios y contingencias',
  'Permisos y cumplimiento',
].map((name, position) => ({ name, required: position < 6, position }));

/** P3: matrix status → `MatrixStatus` (financial consistency). */
export function toMatrixStatus(status: EvaluationItemStatus): MatrixStatus {
  switch (status) {
    case 'APPROVED':
    case 'COMPLETED':
      return 'APPROVED';
    case 'TO_CLARIFY':
      return 'TO_CLARIFY';
    case 'MEDIUM_RISK':
    case 'HIGH_RISK':
      return 'RISK';
  }
}

/** P3: matrix status → `RiskLevel` (customer dependency, legal contingencies). */
export function toRiskLevel(status: EvaluationItemStatus): RiskLevel {
  switch (status) {
    case 'APPROVED':
    case 'COMPLETED':
      return 'LOW';
    case 'MEDIUM_RISK':
      return 'MEDIUM';
    case 'HIGH_RISK':
      return 'HIGH';
    case 'TO_CLARIFY':
      return 'TO_CLARIFY';
  }
}

/** DOCUMENTARY is computed: COMPLETED iff every required folder has documents. */
export function documentaryStatus(
  foldersDelivered: number,
  foldersRequired: number,
): EvaluationItemStatus {
  return foldersRequired > 0 && foldersDelivered >= foldersRequired ? 'COMPLETED' : 'TO_CLARIFY';
}

type Item = { kind: EvaluationItemKind; status: EvaluationItemStatus };

export type ScoreSource = {
  items: Item[];
  foldersDelivered: number;
  foldersRequired: number;
  /** Pesos. */
  financials: { year: number; revenue: bigint; ebitda: bigint }[];
};

/**
 * Builds `computeScore` input from the matrix (single source). Missing items
 * count as TO_CLARIFY. CAGR over the last 3 years (or the available span);
 * margin = last EBITDA / last revenue; both 0 without usable data.
 */
export function toScoreInput(e: ScoreSource): ScoreInput {
  const status = (kind: EvaluationItemKind): EvaluationItemStatus =>
    e.items.find((i) => i.kind === kind)?.status ?? 'TO_CLARIFY';

  const sorted = [...e.financials].sort((a, b) => a.year - b.year).slice(-4);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = first && last ? last.year - first.year : 0;
  const growth =
    first && last && span > 0 && first.revenue > 0n ? cagr(first.revenue, last.revenue, span) : 0;
  const margin = last && last.revenue > 0n ? Number(last.ebitda) / Number(last.revenue) : 0;

  return {
    docsDelivered: e.foldersDelivered,
    docsRequired: e.foldersRequired,
    financialConsistency: toMatrixStatus(status('FINANCIAL_CONSISTENCY')),
    cagr3y: growth,
    ebitdaMargin: margin,
    customerDependency: toRiskLevel(status('CUSTOMER_DEPENDENCY')),
    legalContingencies: toRiskLevel(status('LEGAL_CONTINGENCIES')),
  };
}

export type ApprovalInput = {
  items: Item[];
  foldersDelivered: number;
  foldersRequired: number;
  financialYears: { year: number }[];
  /** When the evaluation (valuation, score) was last computed and persisted. */
  evaluatedAt: Date | null;
  /** Latest change to company, financials or documents, if tracked. */
  lastChangeAt?: Date;
};

/**
 * Why the Back Office cannot approve and publish yet (es-CO); empty = it can.
 * Risks (MEDIUM/HIGH) inform the decision but do not block it.
 */
export function opportunityApprovalBlockers(e: ApprovalInput, now: Date = new Date()): string[] {
  const blockers: string[] = [];

  for (const kind of EVALUATION_ITEM_KINDS) {
    if (EVALUATION_ITEM_META[kind].computed) continue;
    const label = EVALUATION_ITEM_META[kind].label;
    const item = e.items.find((i) => i.kind === kind);
    if (!item) blockers.push(`Falta evaluar «${label}».`);
    else if (item.status === 'TO_CLARIFY') {
      blockers.push(`«${label}» está por aclarar: resuélvelo o solicita ajustes al vendedor.`);
    }
  }

  if (e.foldersRequired <= 0) {
    blockers.push('El data room no tiene carpetas requeridas configuradas.');
  } else if (documentaryStatus(e.foldersDelivered, e.foldersRequired) !== 'COMPLETED') {
    const pending = Math.max(e.foldersRequired - e.foldersDelivered, 0);
    blockers.push(
      `Faltan documentos en ${pending} de ${e.foldersRequired} carpetas requeridas del data room.`,
    );
  }

  const financials = financialYearsIssue(e.financialYears, now);
  if (financials) blockers.push(financials);

  if (!e.evaluatedAt) {
    blockers.push('La evaluación aún no se ha calculado y guardado.');
  } else if (e.lastChangeAt && e.lastChangeAt > e.evaluatedAt) {
    blockers.push(
      'La evaluación está desactualizada: la empresa cambió después del último cálculo.',
    );
  }

  return blockers;
}
