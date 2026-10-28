import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, InvalidTransitionError, ValidationError } from '@/domain/errors';
import { DATA_ROOM_FOLDERS } from '@/domain/evaluation';
import { opportunityMachine } from '@/domain/machines/opportunity';
import { millions } from '@/domain/money';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';
import { getMailer, resetAdaptersForTests as resetMail } from '@/server/mail';
import type { MemoryMailer } from '@/server/mail/memory';
import { cleanupTestUsers, createTestUser } from '@/test/onboarding-fixtures';
import {
  countOpportunitiesForReview,
  decideOpportunity,
  getOpportunityEvaluation,
  listOpportunitiesForReview,
  setEvaluationItem,
} from './opportunity-review';

const tag = `opr${randomUUID().slice(0, 8)}`;
const mailer = () => getMailer() as MemoryMailer;
const NOTES = 'Falta aclarar la concentración de clientes con soportes.';
const REASON = 'La información financiera no es consistente con los soportes.';

const session = async (id: string): Promise<SessionUser> => {
  const row = await db.user.findUniqueOrThrow({ where: { id } });
  return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status };
};

let bo: SessionUser;
let seller: SessionUser;
const oppIds: string[] = [];

/** An IN_REVIEW opportunity with 3 recent financial years and every required folder filled. */
async function inReviewOpportunity(opts: { documents?: boolean } = {}): Promise<string> {
  const { documents = true } = opts;
  const nit = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
  const year = new Date().getFullYear() - 1;
  const org = await db.organization.create({
    data: { name: `Cafés Prueba ${tag} S.A.S.`, nit, kind: 'COMPANY' },
  });
  const company = await db.company.create({
    data: {
      organizationId: org.id,
      sector: 'AGROINDUSTRIA',
      department: 'Cauca',
      city: 'Popayán',
      description: 'Beneficio y trilla de café especial para exportación.',
      channels: ['Exportación'],
      financialYears: {
        create: [
          { year: year - 2, revenue: millions(10_000), ebitda: millions(1_500), netIncome: millions(800) },
          { year: year - 1, revenue: millions(12_000), ebitda: millions(1_900), netIncome: millions(1_000) },
          { year, revenue: millions(14_000), ebitda: millions(2_400), netIncome: millions(1_300) },
        ],
      },
    },
  });
  const opp = await db.opportunity.create({
    data: {
      companyId: company.id,
      sellerId: seller.id,
      title: `Beneficio Andino ${tag}`,
      type: 'VENTA_PARCIAL',
      objective: 'Vender una participación minoritaria para financiar la expansión.',
      status: 'IN_REVIEW',
      folders: {
        create: DATA_ROOM_FOLDERS.map((f) => ({
          name: f.name,
          required: f.required,
          position: f.position,
        })),
      },
    },
    include: { folders: true },
  });
  if (documents) {
    for (const f of opp.folders.filter((x) => x.required)) {
      await db.document.create({
        data: {
          opportunityId: opp.id,
          folderId: f.id,
          uploadedById: seller.id,
          name: `${f.name}.pdf`,
          storageKey: `dataroom/${opp.id}/${randomUUID()}`,
          mime: 'application/pdf',
          size: 1000,
        },
      });
    }
  }
  oppIds.push(opp.id);
  return opp.id;
}

async function evaluateAll(id: string) {
  await setEvaluationItem(bo, id, 'FINANCIAL_CONSISTENCY', 'APPROVED');
  await setEvaluationItem(
    bo,
    id,
    'CUSTOMER_DEPENDENCY',
    'MEDIUM_RISK',
    'Tres clientes concentran el 40 %.',
  );
  await setEvaluationItem(bo, id, 'LEGAL_CONTINGENCIES', 'APPROVED');
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.MAIL_DRIVER = 'memory';
  resetMail();
  const b = await createTestUser(tag, 'BACKOFFICE', 'ENABLED');
  await db.user.update({ where: { id: b.id }, data: { name: 'Revisora Back Office' } });
  bo = await session(b.id);
  seller = await session((await createTestUser(tag, 'SELLER', 'ENABLED')).id);
});

beforeEach(() => {
  vi.restoreAllMocks();
  mailer().clear();
});

afterAll(async () => {
  const opps = await db.opportunity.findMany({
    where: { id: { in: oppIds } },
    select: { id: true, companyId: true, company: { select: { organizationId: true } } },
  });
  const ids = opps.map((o) => o.id);
  const companyIds = opps.map((o) => o.companyId);
  await db.reviewDecision.deleteMany({ where: { subjectId: { in: ids } } });
  await db.evaluation.deleteMany({ where: { opportunityId: { in: ids } } });
  await db.document.deleteMany({ where: { opportunityId: { in: ids } } });
  await db.dataRoomFolder.deleteMany({ where: { opportunityId: { in: ids } } });
  await db.opportunity.deleteMany({ where: { id: { in: ids } } });
  await db.companyFinancialYear.deleteMany({ where: { companyId: { in: companyIds } } });
  await db.company.deleteMany({ where: { id: { in: companyIds } } });
  await db.organization.deleteMany({
    where: { id: { in: opps.map((o) => o.company.organizationId) } },
  });
  await cleanupTestUsers(tag);
  await db.$disconnect();
});

describe('authorization', () => {
  it('rejects a SELLER actor with ForbiddenError on every operation', async () => {
    const id = await inReviewOpportunity();
    await expect(listOpportunitiesForReview(seller)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(countOpportunitiesForReview(seller)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getOpportunityEvaluation(seller, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setEvaluationItem(seller, id, 'LEGAL_CONTINGENCIES', 'APPROVED'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      decideOpportunity(seller, id, { kind: 'APPROVE_AND_PUBLISH' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe('IN_REVIEW');
  });
});

describe('evaluation', () => {
  it('computes valuation, information quality and score live, and lists blockers', async () => {
    const id = await inReviewOpportunity();
    const d = await getOpportunityEvaluation(bo, id);
    expect(d.company.legalName).toContain('Cafés Prueba');
    expect(d.information).toEqual({ delivered: 6, required: 6, percent: 100 });
    expect(d.valuation).not.toBeNull();
    expect(d.financialsIssue).toBeNull();
    expect(d.matrix.find((m) => m.kind === 'DOCUMENTARY')?.status).toBe('COMPLETED');
    expect(d.blockers.length).toBe(3); // three manual items not evaluated yet
    expect(JSON.stringify(d.teaser)).not.toContain('Cafés Prueba');
  });

  it('shows "faltan estados financieros" instead of a range without usable financials', async () => {
    const id = await inReviewOpportunity();
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id } });
    await db.companyFinancialYear.deleteMany({ where: { companyId: opp.companyId } });
    const d = await getOpportunityEvaluation(bo, id);
    expect(d.valuation).toBeNull();
    expect(d.financialsIssue).toMatch(/estados financieros/);
    expect(d.blockers.join(' ')).toMatch(/estados financieros/);
  });

  it('persists the recomputed evaluation when an item is set, and audits without free text', async () => {
    const id = await inReviewOpportunity();
    await setEvaluationItem(bo, id, 'CUSTOMER_DEPENDENCY', 'MEDIUM_RISK', 'Notas privadas del revisor');
    const ev = await db.evaluation.findUniqueOrThrow({
      where: { opportunityId: id },
      include: { items: true },
    });
    expect(ev.docsDelivered).toBe(6);
    expect(ev.docsRequired).toBe(6);
    expect(ev.valuationHigh).toBeGreaterThan(0n);
    expect(ev.items.find((i) => i.kind === 'CUSTOMER_DEPENDENCY')?.notes).toBe(
      'Notas privadas del revisor',
    );
    const logs = await db.auditLog.findMany({
      where: { action: 'EVALUATION_UPDATED', entityId: ev.id },
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0], (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(
      'Notas privadas',
    );
  });

  it('refuses to hand-set the computed documentary item', async () => {
    const id = await inReviewOpportunity();
    await expect(setEvaluationItem(bo, id, 'DOCUMENTARY', 'APPROVED')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('decideOpportunity', () => {
  it('APPROVE with pending items → ValidationError listing the blockers; nothing changes', async () => {
    const id = await inReviewOpportunity();
    await expect(decideOpportunity(bo, id, { kind: 'APPROVE_AND_PUBLISH' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    const opp = await db.opportunity.findUniqueOrThrow({ where: { id } });
    expect(opp.status).toBe('IN_REVIEW');
    expect(opp.publishedAt).toBeNull();
    expect(await db.reviewDecision.count({ where: { subjectId: id } })).toBe(0);
  });

  it('APPROVE with a missing required folder → ValidationError', async () => {
    const id = await inReviewOpportunity({ documents: false });
    await evaluateAll(id);
    await expect(decideOpportunity(bo, id, { kind: 'APPROVE_AND_PUBLISH' })).rejects.toThrow(
      /carpetas requeridas/,
    );
  });

  it('adjustments → seller resubmits → approve → PUBLISHED with publishedAt, decision, notification, email', async () => {
    const id = await inReviewOpportunity();
    await decideOpportunity(bo, id, { kind: 'REQUEST_ADJUSTMENTS', notes: NOTES });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe(
      'ADJUSTMENTS_REQUESTED',
    );
    expect(mailer().sent.at(-1)?.to).toBe(seller.email);

    // The seller resubmits through the machine (their own flow ships in a later task).
    const resubmitted = opportunityMachine.transition('ADJUSTMENTS_REQUESTED', 'RESUBMIT', 'SELLER');
    await db.opportunity.update({ where: { id }, data: { status: resubmitted } });

    await evaluateAll(id);
    await decideOpportunity(bo, id, { kind: 'APPROVE_AND_PUBLISH' });

    const opp = await db.opportunity.findUniqueOrThrow({ where: { id } });
    expect(opp.status).toBe('PUBLISHED');
    expect(opp.publishedAt).toBeInstanceOf(Date);
    const decisions = await db.reviewDecision.findMany({
      where: { subjectType: 'OPPORTUNITY', subjectId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(decisions.map((d) => d.kind)).toEqual(['REQUEST_CORRECTIONS', 'APPROVE']);
    expect(decisions[0]?.text).toBe(NOTES);
    const kinds = (
      await db.notification.findMany({ where: { userId: seller.id }, select: { kind: true } })
    ).map((n) => n.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['OPPORTUNITY_ADJUSTMENTS', 'OPPORTUNITY_PUBLISHED']),
    );
    expect(
      await db.auditLog.count({ where: { action: 'OPPORTUNITY_APPROVED', entityId: id } }),
    ).toBe(1);
    const ev = await db.evaluation.findUniqueOrThrow({ where: { opportunityId: id } });
    expect(ev.score).toBeGreaterThan(0);
  });

  it('REJECT stores the reason in ReviewDecision, not in the audit', async () => {
    const id = await inReviewOpportunity();
    await decideOpportunity(bo, id, { kind: 'REJECT', reason: REASON });
    expect((await db.opportunity.findUniqueOrThrow({ where: { id } })).status).toBe('REJECTED');
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'OPPORTUNITY_REJECTED', entityId: id },
    });
    expect(JSON.stringify(log, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(
      'consistente',
    );
    const d = await getOpportunityEvaluation(bo, id);
    expect(d.decisions[0]).toMatchObject({ kind: 'REJECT', text: REASON });
  });

  it('validates the free text length (10–1000)', async () => {
    const id = await inReviewOpportunity();
    await expect(
      decideOpportunity(bo, id, { kind: 'REJECT', reason: 'corto' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      decideOpportunity(bo, id, { kind: 'REQUEST_ADJUSTMENTS', notes: 'x'.repeat(1001) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('two concurrent decisions → exactly one InvalidTransitionError', async () => {
    const id = await inReviewOpportunity();
    const results = await Promise.allSettled([
      decideOpportunity(bo, id, { kind: 'REJECT', reason: REASON }),
      decideOpportunity(bo, id, { kind: 'REQUEST_ADJUSTMENTS', notes: NOTES }),
    ]);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InvalidTransitionError);
    expect(await db.reviewDecision.count({ where: { subjectId: id } })).toBe(1);
  });

  it('does not decide or evaluate a non-IN_REVIEW opportunity', async () => {
    const id = await inReviewOpportunity();
    await decideOpportunity(bo, id, { kind: 'REJECT', reason: REASON });
    await expect(
      decideOpportunity(bo, id, { kind: 'REJECT', reason: REASON }),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(
      setEvaluationItem(bo, id, 'LEGAL_CONTINGENCIES', 'APPROVED'),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
  });
});

describe('queue', () => {
  it('lists IN_REVIEW first and counts per status', async () => {
    const a = await inReviewOpportunity();
    const b = await inReviewOpportunity();
    await decideOpportunity(bo, b, { kind: 'REJECT', reason: REASON });
    const rows = await listOpportunitiesForReview(bo);
    const mine = rows.filter((r) => [a, b].includes(r.id));
    expect(mine.map((r) => r.id)).toEqual([a, b]);
    const firstOther = rows.findIndex((r) => r.status !== 'IN_REVIEW');
    expect(firstOther).toBe(rows.filter((r) => r.status === 'IN_REVIEW').length);
    expect(mine[0]?.docs).toEqual({ delivered: 6, required: 6 });
    const only = await listOpportunitiesForReview(bo, { status: 'REJECTED' });
    expect(only.every((r) => r.status === 'REJECTED')).toBe(true);
    const counts = await countOpportunitiesForReview(bo);
    expect(counts.IN_REVIEW).toBeGreaterThanOrEqual(1);
    expect(counts.REJECTED).toBeGreaterThanOrEqual(1);
  });
});
