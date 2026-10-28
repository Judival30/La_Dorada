import { Prisma, type ReviewDecisionKind } from '@prisma/client';
import { z } from 'zod';
import { financialYearsIssue } from '@/domain/company';
import { ForbiddenError, InvalidTransitionError, NotFoundError, ValidationError } from '@/domain/errors';
import {
  EVALUATION_ITEM_KINDS,
  EVALUATION_ITEM_META,
  EVALUATION_ITEM_STATUSES,
  documentaryStatus,
  opportunityApprovalBlockers,
  toScoreInput,
  type EvaluationItemKind,
  type EvaluationItemStatus,
} from '@/domain/evaluation';
import {
  opportunityMachine,
  type OpportunityEvent,
  type OpportunityStatus,
} from '@/domain/machines/opportunity';
import type { OpportunityType } from '@/domain/opportunity';
import { assertRole } from '@/domain/policies/roles';
import type { Sector } from '@/domain/sectors';
import { toTeaser, type Teaser } from '@/domain/teaser';
import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_SECTOR_MULTIPLES,
  computeScore,
  valuationRange,
  type ScoreWeights,
  type SectorMultiples,
} from '@/domain/valuation';
import type { InfoSection } from '@/domain/visibility';
import type { AuditAction } from '@/server/audit/actions';
import { audited } from '@/server/audit/audited';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { notify, sendTemplatedEmail, type NotificationKind } from '@/server/notify/notify';
import { recordDecision } from './review-decisions';

/**
 * Back Office opportunity evaluation (M3 Task 3, H12 minimal): queue, live
 * evaluation (valuation, information quality, risk matrix, score), matrix
 * edits and the decision (approve and publish / request adjustments / reject).
 *
 * R1: only a BACKOFFICE actor moves an opportunity to PUBLISHED, and only
 * through `opportunityMachine`. R3: valuation and score come only from
 * `src/domain/valuation.ts` with the `Setting` multiples / weights.
 * Concurrency: `decideOpportunity` and `setEvaluationItem` lock the
 * Opportunity row (`SELECT … FOR UPDATE`) before reading its status.
 */

const MACHINE = 'opportunityReview';

export const REVIEW_QUEUE_STATUSES = [
  'IN_REVIEW',
  'ADJUSTMENTS_REQUESTED',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
] as const satisfies readonly OpportunityStatus[];

/** Queue order: what needs a decision first. */
const STATUS_RANK: Record<OpportunityStatus, number> = {
  IN_REVIEW: 0,
  ADJUSTMENTS_REQUESTED: 1,
  PUBLISHED: 2,
  SUSPENDED: 3,
  REJECTED: 4,
  WITHDRAWN_BY_SELLER: 5,
  CLOSED: 6,
  DRAFT: 7,
};

const QUEUE_LIMIT = 200;

export type OpportunityDecision =
  | { kind: 'APPROVE_AND_PUBLISH' }
  | { kind: 'REQUEST_ADJUSTMENTS'; notes: string }
  | { kind: 'REJECT'; reason: string };

export type OpportunityReviewRow = {
  id: string;
  title: string;
  status: OpportunityStatus;
  companyName: string;
  sector: Sector;
  department: string;
  type: OpportunityType;
  sellerName: string;
  docs: { delivered: number; required: number };
  /** Last time the opportunity changed (submission time while IN_REVIEW). */
  updatedAt: Date;
};

export type MatrixRow = {
  kind: EvaluationItemKind;
  label: string;
  description: string;
  computed: boolean;
  /** null: not evaluated yet. */
  status: EvaluationItemStatus | null;
  notes: string | null;
};

export type OpportunityEvaluationDetail = {
  opportunity: {
    id: string;
    title: string;
    status: OpportunityStatus;
    type: OpportunityType;
    objective: string;
    horizon: string | null;
    dealSizeMin: bigint | null;
    dealSizeMax: bigint | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sellerName: string;
  };
  /** The Back Office sees the real identity; the buyer never does. */
  company: {
    legalName: string;
    nit: string;
    sector: Sector;
    subsector: string | null;
    department: string;
    city: string;
    foundedYear: number | null;
    employeesRange: string | null;
    description: string;
    channels: string[];
    capacity: string | null;
  };
  financials: { year: number; revenue: bigint; ebitda: bigint; netIncome: bigint }[];
  folders: { name: string; required: boolean; documents: number }[];
  information: { delivered: number; required: number; percent: number };
  /** null when the financials are not usable (see `financialsIssue`). */
  valuation: { low: bigint; high: bigint; basis: 'EBITDA' | 'REVENUE' } | null;
  financialsIssue: string | null;
  matrix: MatrixRow[];
  score: { total: number; breakdown: Record<keyof ScoreWeights, number> };
  /** Why "Aprobar y publicar" is not available yet (es-CO); empty = it is. */
  blockers: string[];
  teaser: Teaser;
  decisions: { at: Date; kind: ReviewDecisionKind; text: string | null; actorName: string | null }[];
};

// ───────────────────────────── validation ─────────────────────────────

const longText = (field: string, article: string) =>
  z
    .string({ error: `Escribe ${article} ${field}.` })
    .trim()
    .min(10, { error: `${field.charAt(0).toUpperCase()}${field.slice(1)} debe tener al menos 10 caracteres.` })
    .max(1000, { error: `${field.charAt(0).toUpperCase()}${field.slice(1)} no puede superar 1000 caracteres.` });

const decisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('APPROVE_AND_PUBLISH') }),
  z.object({ kind: z.literal('REQUEST_ADJUSTMENTS'), notes: longText('observaciones', 'las') }),
  z.object({ kind: z.literal('REJECT'), reason: longText('motivo', 'el') }),
]);

const filterSchema = z.object({ status: z.enum(REVIEW_QUEUE_STATUSES).optional() });
const itemSchema = z.object({
  kind: z.enum(EVALUATION_ITEM_KINDS),
  status: z.enum(EVALUATION_ITEM_STATUSES),
  notes: z
    .string()
    .trim()
    .max(500, { error: 'Las notas no pueden superar 500 caracteres.' })
    .optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0]?.message ?? 'Revisa los datos ingresados.');
  }
  return r.data;
}

function assertBackoffice(actor: SessionUser): void {
  assertRole(actor, 'BACKOFFICE');
}

// ───────────────────────────── evaluation core ─────────────────────────────

type Client = Prisma.TransactionClient | typeof db;

type Computed = {
  financials: { year: number; revenue: bigint; ebitda: bigint; netIncome: bigint }[];
  financialsIssue: string | null;
  folders: { name: string; required: boolean; documents: number }[];
  foldersDelivered: number;
  foldersRequired: number;
  valuation: { low: bigint; high: bigint; basis: 'EBITDA' | 'REVENUE' } | null;
  items: { kind: EvaluationItemKind; status: EvaluationItemStatus; notes: string | null }[];
  score: { total: number; breakdown: Record<keyof ScoreWeights, number> };
  blockers: string[];
};

async function readSettings(
  client: Client,
): Promise<{ multiples: Record<string, SectorMultiples>; weights: ScoreWeights }> {
  const rows = await client.setting.findMany({
    where: { key: { in: ['sectorMultiples', 'scoreWeights'] } },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value;
  return {
    multiples:
      (value('sectorMultiples') as unknown as Record<string, SectorMultiples> | undefined) ??
      DEFAULT_SECTOR_MULTIPLES,
    weights: (value('scoreWeights') as unknown as ScoreWeights | undefined) ?? DEFAULT_SCORE_WEIGHTS,
  };
}

/**
 * Pure computation from rows already loaded. `override` replaces the persisted
 * matrix item of that kind (used by `setEvaluationItem` before persisting).
 */
function compute(
  data: {
    sector: Sector;
    financials: Computed['financials'];
    folders: Computed['folders'];
    persisted: { kind: EvaluationItemKind; status: EvaluationItemStatus; notes: string | null }[];
  },
  settings: { multiples: Record<string, SectorMultiples>; weights: ScoreWeights },
  override?: { kind: EvaluationItemKind; status: EvaluationItemStatus; notes: string | null },
  now: Date = new Date(),
): Computed {
  const required = data.folders.filter((f) => f.required);
  const foldersRequired = required.length;
  const foldersDelivered = required.filter((f) => f.documents > 0).length;

  const items: Computed['items'] = [
    {
      kind: 'DOCUMENTARY',
      status: documentaryStatus(foldersDelivered, foldersRequired),
      notes: null,
    },
    ...EVALUATION_ITEM_KINDS.filter((k) => !EVALUATION_ITEM_META[k].computed).flatMap((kind) => {
      const item =
        override && override.kind === kind ? override : data.persisted.find((p) => p.kind === kind);
      return item ? [{ kind, status: item.status, notes: item.notes }] : [];
    }),
  ];

  const sorted = [...data.financials].sort((a, b) => a.year - b.year);
  const financialsIssue = financialYearsIssue(sorted, now);
  const scoreInput = toScoreInput({
    items,
    foldersDelivered,
    foldersRequired,
    financials: sorted,
  });
  const score = computeScore(scoreInput, settings.weights);
  const last = sorted[sorted.length - 1];
  const valuation =
    !financialsIssue && last
      ? valuationRange(
          { revenue: last.revenue, ebitda: last.ebitda, cagr3y: scoreInput.cagr3y },
          settings.multiples[data.sector] ?? DEFAULT_SECTOR_MULTIPLES[data.sector],
        )
      : null;

  // The evaluation is computed right now, so it is never stale.
  const blockers = opportunityApprovalBlockers(
    {
      items,
      foldersDelivered,
      foldersRequired,
      financialYears: sorted,
      evaluatedAt: now,
    },
    now,
  );

  return {
    financials: sorted,
    financialsIssue,
    folders: data.folders,
    foldersDelivered,
    foldersRequired,
    valuation,
    items,
    score,
    blockers,
  };
}

async function loadOpportunity(client: Client, id: string) {
  const opp = await client.opportunity.findUnique({
    where: { id },
    include: {
      seller: { select: { name: true, email: true } },
      company: { include: { organization: { select: { name: true, nit: true } }, financialYears: true } },
      infoSections: { select: { section: true, inTeaser: true } },
      folders: {
        orderBy: { position: 'asc' },
        select: { name: true, required: true, _count: { select: { documents: true } } },
      },
      evaluation: { include: { items: true } },
    },
  });
  if (!opp || opp.status === 'DRAFT') throw new NotFoundError('Opportunity not found');
  return opp;
}

type LoadedOpportunity = Awaited<ReturnType<typeof loadOpportunity>>;

function computeFor(opp: LoadedOpportunity, settings: Awaited<ReturnType<typeof readSettings>>, override?: Parameters<typeof compute>[2]) {
  return compute(
    {
      sector: opp.company.sector,
      financials: opp.company.financialYears.map((y) => ({
        year: y.year,
        revenue: y.revenue,
        ebitda: y.ebitda,
        netIncome: y.netIncome,
      })),
      folders: opp.folders.map((f) => ({
        name: f.name,
        required: f.required,
        documents: f._count.documents,
      })),
      persisted: (opp.evaluation?.items ?? []).map((i) => ({
        kind: i.kind,
        status: i.status,
        notes: i.notes,
      })),
    },
    settings,
    override,
  );
}

/** Upserts the Evaluation row (and every item of the matrix) from a computed evaluation. */
async function persistEvaluation(
  tx: Prisma.TransactionClient,
  opportunityId: string,
  c: Computed,
): Promise<string> {
  const data = {
    valuationLow: c.valuation?.low ?? 0n,
    valuationHigh: c.valuation?.high ?? 0n,
    score: c.score.total,
    docsDelivered: c.foldersDelivered,
    docsRequired: c.foldersRequired,
    breakdown: c.score.breakdown as unknown as Prisma.InputJsonValue,
  };
  const evaluation = await tx.evaluation.upsert({
    where: { opportunityId },
    create: { opportunityId, ...data },
    update: data,
    select: { id: true },
  });
  for (const item of c.items) {
    await tx.evaluationItem.upsert({
      where: { evaluationId_kind: { evaluationId: evaluation.id, kind: item.kind } },
      create: { evaluationId: evaluation.id, kind: item.kind, status: item.status, notes: item.notes },
      update: { status: item.status, notes: item.notes },
    });
  }
  return evaluation.id;
}

type LockedOpportunity = { id: string; status: OpportunityStatus; sellerId: string };

async function lockOpportunity(tx: Prisma.TransactionClient, id: string): Promise<LockedOpportunity> {
  const rows = await tx.$queryRaw<LockedOpportunity[]>`
    SELECT id, status::text AS status, "sellerId"
    FROM "Opportunity" WHERE id = ${id} FOR UPDATE`;
  const row = rows[0];
  if (!row || row.status === 'DRAFT') throw new NotFoundError('Opportunity not found');
  return row;
}

// ───────────────────────────── reads ─────────────────────────────

/** Opportunities per status (DRAFT is the seller's private business and never counted). */
export async function countOpportunitiesForReview(
  actor: SessionUser,
): Promise<Partial<Record<OpportunityStatus, number>>> {
  assertBackoffice(actor);
  const groups = await db.opportunity.groupBy({
    by: ['status'],
    where: { status: { not: 'DRAFT' } },
    _count: { _all: true },
  });
  const out: Partial<Record<OpportunityStatus, number>> = {};
  for (const g of groups) out[g.status] = g._count._all;
  return out;
}

/**
 * Review queue (never DRAFT), optionally one status. IN_REVIEW first, then
 * ADJUSTMENTS_REQUESTED, PUBLISHED…; inside each status the oldest first (FIFO).
 */
export async function listOpportunitiesForReview(
  actor: SessionUser,
  filter: { status?: (typeof REVIEW_QUEUE_STATUSES)[number] } = {},
): Promise<OpportunityReviewRow[]> {
  assertBackoffice(actor);
  const f = parseOrThrow(filterSchema, filter);
  const rows = await db.opportunity.findMany({
    where: f.status ? { status: f.status } : { status: { not: 'DRAFT' } },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: QUEUE_LIMIT,
    select: {
      id: true,
      title: true,
      status: true,
      type: true,
      updatedAt: true,
      seller: { select: { name: true } },
      company: {
        select: { sector: true, department: true, organization: { select: { name: true } } },
      },
      folders: {
        where: { required: true },
        select: { _count: { select: { documents: true } } },
      },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      type: r.type,
      companyName: r.company.organization.name,
      sector: r.company.sector,
      department: r.company.department,
      sellerName: r.seller.name,
      docs: {
        delivered: r.folders.filter((x) => x._count.documents > 0).length,
        required: r.folders.length,
      },
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

/**
 * Everything the reviewer needs for one opportunity, computed live from the
 * current data (company, financials, folders, Settings) plus the persisted
 * matrix. Unknown id or DRAFT → `NotFoundError`.
 */
export async function getOpportunityEvaluation(
  actor: SessionUser,
  id: string,
): Promise<OpportunityEvaluationDetail> {
  assertBackoffice(actor);
  const opp = await loadOpportunity(db, id);
  const settings = await readSettings(db);
  const c = computeFor(opp, settings);
  const co = opp.company;
  const legalName = co.organization.name;
  const nit = co.organization.nit;

  const decisions = await db.reviewDecision.findMany({
    where: { subjectType: 'OPPORTUNITY', subjectId: id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { actor: { select: { name: true } } },
  });

  const teaser = toTeaser({
    id: opp.id,
    title: opp.title,
    type: opp.type,
    objective: opp.objective,
    idealBuyerProfile: opp.idealBuyerProfile,
    dealSizeMin: opp.dealSizeMin,
    dealSizeMax: opp.dealSizeMax,
    horizon: opp.horizon,
    sector: co.sector,
    subsector: co.subsector,
    department: co.department,
    city: co.city,
    legalName,
    nit,
    description: co.description,
    employeesRange: co.employeesRange,
    foundedYear: co.foundedYear,
    channels: co.channels,
    capacity: co.capacity,
    financials: c.financials.map((y) => ({ year: y.year, revenue: y.revenue })),
    visibility: opp.infoSections.map((v) => ({ section: v.section as InfoSection, inTeaser: v.inTeaser })),
    teaserImageUrl: opp.teaserImage,
    evaluation: c.valuation
      ? { valuationLow: c.valuation.low, valuationHigh: c.valuation.high, score: c.score.total }
      : null,
  });

  return {
    opportunity: {
      id: opp.id,
      title: opp.title,
      status: opp.status,
      type: opp.type,
      objective: opp.objective,
      horizon: opp.horizon,
      dealSizeMin: opp.dealSizeMin,
      dealSizeMax: opp.dealSizeMax,
      publishedAt: opp.publishedAt,
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
      sellerName: opp.seller.name,
    },
    company: {
      legalName,
      nit,
      sector: co.sector,
      subsector: co.subsector,
      department: co.department,
      city: co.city,
      foundedYear: co.foundedYear,
      employeesRange: co.employeesRange,
      description: co.description,
      channels: co.channels,
      capacity: co.capacity,
    },
    financials: c.financials,
    folders: c.folders,
    information: {
      delivered: c.foldersDelivered,
      required: c.foldersRequired,
      percent:
        c.foldersRequired > 0 ? Math.round((100 * c.foldersDelivered) / c.foldersRequired) : 0,
    },
    valuation: c.valuation,
    financialsIssue: c.financialsIssue,
    matrix: EVALUATION_ITEM_KINDS.map((kind) => {
      const item = c.items.find((i) => i.kind === kind);
      return {
        kind,
        label: EVALUATION_ITEM_META[kind].label,
        description: EVALUATION_ITEM_META[kind].description,
        computed: EVALUATION_ITEM_META[kind].computed,
        status: item?.status ?? null,
        notes: item?.notes ?? null,
      };
    }),
    score: c.score,
    blockers: c.blockers,
    teaser,
    decisions: decisions.map((d) => ({
      at: d.createdAt,
      kind: d.kind,
      text: d.text,
      actorName: d.actor.name,
    })),
  };
}

// ───────────────────────────── mutations ─────────────────────────────

/**
 * Sets one matrix item of an IN_REVIEW opportunity and persists the
 * recomputed evaluation (valuation, score, breakdown, folders). DOCUMENTARY is
 * computed and cannot be set by hand.
 */
export async function setEvaluationItem(
  actor: SessionUser,
  opportunityId: string,
  kind: EvaluationItemKind,
  status: EvaluationItemStatus,
  notes?: string,
): Promise<void> {
  assertBackoffice(actor);
  const v = parseOrThrow(itemSchema, { kind, status, notes });
  if (EVALUATION_ITEM_META[v.kind].computed) {
    throw new ValidationError('Este ítem se calcula solo y no se puede editar.');
  }

  await audited(async (tx) => {
    const locked = await lockOpportunity(tx, opportunityId);
    if (locked.status !== 'IN_REVIEW') {
      throw new InvalidTransitionError(MACHINE, locked.status, 'EVALUATE');
    }
    const opp = await loadOpportunity(tx, opportunityId);
    const settings = await readSettings(tx);
    const c = computeFor(opp, settings, { kind: v.kind, status: v.status, notes: v.notes || null });
    const evaluationId = await persistEvaluation(tx, opportunityId, c);
    return {
      result: undefined,
      audit: {
        actorId: actor.id,
        action: 'EVALUATION_UPDATED',
        entity: 'Evaluation',
        entityId: evaluationId,
        after: { opportunityId, kind: v.kind, status: v.status, score: c.score.total },
      },
    };
  });
}

const DECISION: Record<
  OpportunityDecision['kind'],
  {
    event: OpportunityEvent;
    review: ReviewDecisionKind;
    action: AuditAction;
    notification: NotificationKind;
  }
> = {
  APPROVE_AND_PUBLISH: {
    event: 'APPROVE_AND_PUBLISH',
    review: 'APPROVE',
    action: 'OPPORTUNITY_APPROVED',
    notification: 'OPPORTUNITY_PUBLISHED',
  },
  REQUEST_ADJUSTMENTS: {
    event: 'REQUEST_ADJUSTMENTS',
    review: 'REQUEST_CORRECTIONS',
    action: 'OPPORTUNITY_ADJUSTMENTS_REQUESTED',
    notification: 'OPPORTUNITY_ADJUSTMENTS',
  },
  REJECT: {
    event: 'REJECT',
    review: 'REJECT',
    action: 'OPPORTUNITY_REJECTED',
    notification: 'OPPORTUNITY_REJECTED',
  },
};

/**
 * Decides an IN_REVIEW opportunity. Locks the row, applies the
 * `opportunityMachine` event with the actor's role (a SELLER can never publish),
 * and for APPROVE requires an empty `opportunityApprovalBlockers` computed
 * right now; it then persists the evaluation and sets `publishedAt`. The decision
 * text goes to `ReviewDecision` (never the audit); the seller is notified in-app
 * inside the transaction and by email after the commit.
 */
export async function decideOpportunity(
  actor: SessionUser,
  opportunityId: string,
  decision: OpportunityDecision,
): Promise<void> {
  assertBackoffice(actor);
  const d = parseOrThrow(decisionSchema, decision);
  const spec = DECISION[d.kind];

  const mail = await audited(async (tx) => {
    const locked = await lockOpportunity(tx, opportunityId);
    if (locked.sellerId === actor.id) {
      throw new ForbiddenError('A reviewer cannot act on their own opportunity');
    }
    const next = opportunityMachine.transition(locked.status, spec.event, actor.role);
    const opp = await loadOpportunity(tx, opportunityId);

    if (d.kind === 'APPROVE_AND_PUBLISH') {
      const c = computeFor(opp, await readSettings(tx));
      if (c.blockers.length > 0) {
        throw new ValidationError(`No es posible publicar todavía:\n${c.blockers.join('\n')}`);
      }
      await persistEvaluation(tx, opportunityId, c);
    }

    await tx.opportunity.update({
      where: { id: opportunityId },
      data: { status: next, ...(d.kind === 'APPROVE_AND_PUBLISH' ? { publishedAt: new Date() } : {}) },
    });
    await recordDecision(tx, {
      subjectType: 'OPPORTUNITY',
      subjectId: opportunityId,
      kind: spec.review,
      text: d.kind === 'REQUEST_ADJUSTMENTS' ? d.notes : d.kind === 'REJECT' ? d.reason : null,
      actorId: actor.id,
    });
    await notify(tx, {
      userId: locked.sellerId,
      kind: spec.notification,
      payload: { opportunityId, title: opp.title },
    });

    return {
      result: { to: opp.seller.email, name: opp.seller.name },
      audit: {
        actorId: actor.id,
        action: spec.action,
        entity: 'Opportunity',
        entityId: opportunityId,
        before: { status: locked.status },
        after: { status: next },
      },
    };
  });

  await sendTemplatedEmail(mail.to, spec.notification, { name: mail.name });
}
