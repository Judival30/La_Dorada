import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NDA_TEXT } from '@/content/nda';
import { DATA_ROOM_FOLDERS, EVALUATION_ITEM_KINDS, toScoreInput } from '@/domain/evaluation';
import { toTeaser } from '@/domain/teaser';
import type { Sector } from '@/domain/sectors';
import {
  computeScore,
  valuationRange,
  type ScoreWeights,
  type SectorMultiples,
} from '@/domain/valuation';
import { INFO_SECTIONS } from '@/domain/visibility';
import { resolveTeaserImage } from '@/server/opportunities/teaser-image';
import { db } from '@/server/db';
import { verifyAuditChain } from '@/server/audit/audit';
import { onboardingProgress, PROFILE_SCHEMAS, type ProfileData } from '@/domain/onboarding';
import { getStorage, resetAdaptersForTests } from '@/server/storage';
import type { MemoryStorage } from '@/server/storage/memory';
import { seed } from './index';
import { SEED_COMPANIES } from './data/companies';
import { SEED_USERS } from './data/users';

async function counts() {
  const [users, orgs, companies, years, opps, settings] = await Promise.all([
    db.user.count(),
    db.organization.count(),
    db.company.count(),
    db.companyFinancialYear.count(),
    db.opportunity.count(),
    db.setting.count(),
  ]);
  return { users, orgs, companies, years, opps, settings };
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.STORAGE_DRIVER = 'memory';
  resetAdaptersForTests();
});

afterAll(async () => {
  await db.$disconnect();
});

describe('seed verification cases', () => {
  it('gives every BUYER/SELLER one coherent case per status', async () => {
    await seed(db);

    const users = await db.user.findMany({
      where: { role: { in: ['BUYER', 'SELLER'] } },
      include: {
        verificationCases: { include: { documents: true, checklist: true } },
      },
    });
    expect(users.length).toBeGreaterThan(0);
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@demo.ladorada.co' } });
    const expected: Record<string, string> = {
      ENABLED: 'APPROVED',
      BLOCKED: 'APPROVED',
      IN_REVIEW: 'IN_REVIEW',
      CORRECTIONS_REQUESTED: 'CORRECTIONS_REQUESTED',
      PENDING: 'OPEN',
      REJECTED: 'REJECTED',
    };
    for (const u of users) {
      expect(u.verificationCases, u.email).toHaveLength(1);
      const c = u.verificationCases[0]!;
      expect(c.status, u.email).toBe(expected[u.status]);
      expect(c.checklist, u.email).toHaveLength(4);
      expect(u.phone, u.email).toMatch(/^\+573\d{9}$/);
      const profile = c.profile as ProfileData;
      expect(PROFILE_SCHEMAS.step1.safeParse(profile.step1).success).toBe(true);

      if (u.status === 'ENABLED' || u.status === 'BLOCKED') {
        expect(c.decidedById).toBe(admin.id);
        expect(c.submittedAt && c.submittedAt < new Date()).toBe(true);
        expect(c.decidedAt && c.decidedAt < new Date()).toBe(true);
        expect(c.documents.every((d) => d.reviewStatus === 'APPROVED')).toBe(true);
        expect(c.checklist.every((i) => i.done && i.checkedById === admin.id)).toBe(true);
      }
      if (u.status === 'ENABLED') {
        const p = onboardingProgress({
          role: u.role as 'BUYER' | 'SELLER',
          profile,
          isLegalRepresentative: c.isLegalRepresentative,
          buyerType: c.buyerType,
          hasPreferences: false,
          documents: c.documents.map((d) => ({ type: d.type, reviewStatus: d.reviewStatus })),
        });
        expect(p.canSubmit, u.email).toBe(true);
      }
      if (u.status === 'IN_REVIEW') {
        expect(c.submittedAt).not.toBeNull();
        expect(c.documents.length).toBeGreaterThan(0);
        expect(c.documents.every((d) => d.reviewStatus === 'PENDING')).toBe(true);
        expect(c.checklist.every((i) => !i.done)).toBe(true);
      }
      if (u.status === 'CORRECTIONS_REQUESTED') {
        expect(c.correctionNotes).toBeTruthy();
        expect(c.documents.filter((d) => d.reviewStatus === 'REJECTED')).toHaveLength(1);
      }
      if (u.status === 'REJECTED') expect(c.rejectionReason).toBeTruthy();
      if (u.status === 'PENDING') expect(c.documents).toHaveLength(0);
    }
    expect(users.filter((u) => u.status === 'IN_REVIEW').length).toBeGreaterThanOrEqual(3);

    const poa = await db.verificationDocument.count({ where: { type: 'POWER_OF_ATTORNEY' } });
    expect(poa).toBeGreaterThanOrEqual(1);
  });

  it('second run keeps case, document and checklist counts and uploads nothing new', async () => {
    const storage = getStorage() as MemoryStorage;
    const count = async () => ({
      cases: await db.verificationCase.count(),
      docs: await db.verificationDocument.count(),
      kyc: await db.kycChecklistItem.count(),
      objects: storage.objects.size,
    });
    const before = await count();
    await seed(db);
    expect(await count()).toEqual(before);
  });
});

describe('seed', () => {
  it('loads demo accounts, companies, financials and a valid audit chain', async () => {
    await seed(db);

    const demo = await db.user.findMany({
      where: {
        email: {
          in: ['comprador@demo.ladorada.co', 'vendedor@demo.ladorada.co', 'admin@demo.ladorada.co'],
        },
      },
    });
    expect(demo).toHaveLength(3);
    expect(demo.every((u) => u.status === 'ENABLED')).toBe(true);

    const review = await db.user.findUnique({ where: { email: 'revision@demo.ladorada.co' } });
    expect(review?.status).toBe('IN_REVIEW');

    expect(await db.user.count()).toBe(SEED_USERS.length);
    expect(await db.opportunity.count({ where: { status: 'PUBLISHED' } })).toBe(11);
    expect(await db.company.count()).toBe(15);
    const companies = await db.company.findMany({ include: { financialYears: true } });
    expect(companies.every((c) => c.financialYears.length === 5)).toBe(true);

    const opps = await db.opportunity.findMany();
    expect(opps).toHaveLength(SEED_COMPANIES.length);
    for (const o of opps) {
      expect(o.teaserImage?.startsWith('data:image/svg+xml')).toBe(true);
      const published = o.status === 'PUBLISHED' || o.status === 'SUSPENDED';
      expect(o.publishedAt !== null).toBe(published);
    }
    expect(
      await db.setting.count({ where: { key: { in: ['sectorMultiples', 'scoreWeights'] } } }),
    ).toBe(2);

    expect((await verifyAuditChain(db)).ok).toBe(true);
  });

  it('is idempotent: a second run keeps counts identical', async () => {
    const before = await counts();
    const runs = await db.auditLog.count({ where: { action: 'SEED_LOADED' } });
    await seed(db);
    expect(await counts()).toEqual(before);
    expect((await verifyAuditChain(db)).ok).toBe(true);
    expect(await db.auditLog.count({ where: { action: 'SEED_LOADED' } })).toBe(runs + 1);
  });
});

describe('seed demo journey', () => {
  const REQUIRED = DATA_ROOM_FOLDERS.filter((f) => f.required).length;

  it('gives every opportunity its folders, visibility and coherent documents', async () => {
    await seed(db);
    const opps = await db.opportunity.findMany({
      include: { folders: { include: { documents: true } }, infoSections: true },
    });
    expect(opps).toHaveLength(15);
    for (const o of opps) {
      expect(o.folders, o.title).toHaveLength(DATA_ROOM_FOLDERS.length);
      expect(o.infoSections, o.title).toHaveLength(INFO_SECTIONS.length);
      const delivered = o.folders.filter((f) => f.required && f.documents.length > 0).length;
      if (o.status === 'DRAFT') expect(delivered).toBeLessThan(REQUIRED);
      else expect(delivered, o.title).toBe(REQUIRED);
      for (const f of o.folders.filter((x) => x.required && x.documents.length > 0)) {
        expect(f.documents.length).toBeGreaterThanOrEqual(1);
        expect(f.documents.length).toBeLessThanOrEqual(3);
      }
      for (const d of o.folders.flatMap((f) => f.documents)) {
        expect(d.storageKey).toMatch(new RegExp(`^dataroom/${o.id}/[0-9a-f-]{36}$`));
      }
    }
  });

  it('evaluates PUBLISHED and SUSPENDED with valuationRange and a 0-100 score; IN_REVIEW has none', async () => {
    const multiples = (await db.setting.findUniqueOrThrow({ where: { key: 'sectorMultiples' } }))
      .value as unknown as Record<Sector, SectorMultiples>;
    const weights = (await db.setting.findUniqueOrThrow({ where: { key: 'scoreWeights' } }))
      .value as unknown as ScoreWeights;
    const opps = await db.opportunity.findMany({
      include: {
        company: { include: { financialYears: true } },
        evaluation: { include: { items: true } },
      },
    });
    for (const o of opps) {
      if (o.status === 'PUBLISHED' || o.status === 'SUSPENDED') {
        const e = o.evaluation;
        expect(e, o.title).not.toBeNull();
        expect(e!.items.map((i) => i.kind).sort()).toEqual([...EVALUATION_ITEM_KINDS].sort());
        expect(e!.score).toBeGreaterThanOrEqual(0);
        expect(e!.score).toBeLessThanOrEqual(100);
        expect(e!.docsDelivered).toBe(REQUIRED);
        expect(e!.docsRequired).toBe(REQUIRED);
        const sorted = [...o.company.financialYears].sort((a, b) => a.year - b.year);
        const input = toScoreInput({
          items: e!.items,
          foldersDelivered: e!.docsDelivered,
          foldersRequired: e!.docsRequired,
          financials: sorted,
        });
        const last = sorted[sorted.length - 1]!;
        const range = valuationRange(
          { revenue: last.revenue, ebitda: last.ebitda, cagr3y: input.cagr3y },
          multiples[o.company.sector],
        );
        expect(e!.valuationLow).toBe(range.low);
        expect(e!.valuationHigh).toBe(range.high);
        expect(e!.score).toBe(computeScore(input, weights).total);
      } else {
        expect(o.evaluation, o.title).toBeNull();
      }
    }
    const inReview = opps.filter((o) => o.status === 'IN_REVIEW');
    expect(inReview).toHaveLength(2);
    for (const o of inReview) expect(o.company.financialYears.length).toBeGreaterThanOrEqual(3);
  });

  it('teaser of every published opportunity hides legal name, city and NIT', async () => {
    const opps = await db.opportunity.findMany({
      where: { status: 'PUBLISHED' },
      include: {
        company: { include: { organization: true, financialYears: true } },
        infoSections: true,
        evaluation: true,
      },
    });
    expect(opps).toHaveLength(11);
    for (const o of opps) {
      const teaser = toTeaser({
        id: o.id,
        title: o.title,
        type: o.type,
        objective: o.objective,
        idealBuyerProfile: o.idealBuyerProfile,
        dealSizeMin: o.dealSizeMin,
        dealSizeMax: o.dealSizeMax,
        horizon: o.horizon,
        sector: o.company.sector,
        subsector: o.company.subsector,
        department: o.company.department,
        city: o.company.city,
        legalName: o.company.organization.name,
        nit: o.company.organization.nit,
        description: o.company.description,
        employeesRange: o.company.employeesRange,
        foundedYear: o.company.foundedYear,
        financials: o.company.financialYears,
        visibility: o.infoSections,
        teaserImageUrl: null,
        evaluation: o.evaluation,
      });
      const text = JSON.stringify(teaser).toLowerCase();
      expect(text, o.title).not.toContain(o.company.organization.name.toLowerCase());
      // City: checked on the teaser's own texts (title + sections). The top-level
      // `department` field is not part of these, so a city equal to a department
      // (Bogotá) needs no special case.
      const texts = [
        teaser.title,
        ...Object.values(teaser.sections).flatMap((s) => [
          s.title,
          s.text ?? '',
          ...s.fields.flatMap((f) => [f.label, f.value]),
        ]),
      ]
        .join('\n')
        .toLowerCase();
      expect(texts, o.title).not.toContain(o.company.city.toLowerCase());
      // NIT: formatted form and the 9 base digits (any separators stripped).
      const nit = o.company.organization.nit;
      expect(JSON.stringify(teaser), o.title).not.toContain(nit);
      const base = nit.replace(/\D/g, '').slice(0, 9);
      expect(base).toHaveLength(9);
      expect(JSON.stringify(teaser).replace(/\D/g, ''), o.title).not.toContain(base);
      // P5: the stored texts are anonymous at the source, not only after scrubbing.
      for (const raw of [o.objective, o.company.description]) {
        expect(raw, o.title).not.toContain(o.company.city);
        expect(raw, o.title).not.toContain(o.company.organization.name.replace(/ S\.A\.S\.$/, ''));
      }
    }
  });

  it('records review decisions for opportunities and decided users', async () => {
    const approvals = await db.reviewDecision.count({
      where: { subjectType: 'OPPORTUNITY', kind: 'APPROVE' },
    });
    expect(approvals).toBe(12);
    const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@demo.ladorada.co' } });
    const check = async (
      status: 'ENABLED' | 'CORRECTIONS_REQUESTED' | 'REJECTED' | 'BLOCKED',
      kind: 'APPROVE' | 'REQUEST_CORRECTIONS' | 'REJECT' | 'BLOCK',
      withText: boolean,
    ) => {
      const users = await db.user.findMany({
        where: { status, role: { in: ['BUYER', 'SELLER'] } },
        select: { id: true },
      });
      expect(users.length).toBeGreaterThan(0);
      for (const u of users) {
        const d = await db.reviewDecision.findFirst({
          where: { subjectType: 'USER', subjectId: u.id, kind },
        });
        expect(d, `${status}/${kind}`).not.toBeNull();
        expect(d!.actorId).toBe(admin.id);
        if (withText) expect(d!.text).toBeTruthy();
      }
    };
    await check('ENABLED', 'APPROVE', false);
    await check('CORRECTIONS_REQUESTED', 'REQUEST_CORRECTIONS', true);
    await check('REJECTED', 'REJECT', true);
    await check('BLOCKED', 'BLOCK', true);
  });

  it('builds the advanced process on Cafés de Antioquia', async () => {
    const opp = await db.opportunity.findFirstOrThrow({
      where: { company: { slug: 'cafes-de-antioquia' } },
    });
    const buyer = await db.user.findUniqueOrThrow({
      where: { email: 'comprador@demo.ladorada.co' },
    });
    const ar = await db.accessRequest.findUniqueOrThrow({
      where: { buyerId_opportunityId: { buyerId: buyer.id, opportunityId: opp.id } },
      include: { ndaSignatures: true },
    });
    expect(ar.status).toBe('AUTHORIZED');
    expect(ar.relevance).toBe(92);
    expect(ar.ndaSignatures).toHaveLength(1);
    const sig = ar.ndaSignatures[0]!;
    expect(sig.documentHash).toBe(createHash('sha256').update(NDA_TEXT, 'utf8').digest('hex'));
    const days = (sig.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(354);
    expect(days).toBeLessThan(356);

    const second = await db.user.findUniqueOrThrow({
      where: { email: 'inversiones.pacifico@demo.ladorada.co' },
    });
    const pending = await db.accessRequest.findUniqueOrThrow({
      where: { buyerId_opportunityId: { buyerId: second.id, opportunityId: opp.id } },
      include: { ndaSignatures: true },
    });
    expect(pending.status).toBe('NDA_SIGNED');
    expect(pending.ndaSignatures).toHaveLength(1);

    const deal = await db.deal.findFirstOrThrow({
      where: { opportunityId: opp.id, buyerId: buyer.id },
      include: { offers: { orderBy: { createdAt: 'asc' } } },
    });
    expect(deal.status).toBe('COUNTER_OFFER');
    expect(deal.offers).toHaveLength(2);
    const [first, counter] = deal.offers;
    expect(first).toMatchObject({ author: 'BUYER', status: 'COUNTERED', stakePct: 40 });
    expect(first!.preMoneyValue).toBe(25_000_000_000n);
    expect(counter).toMatchObject({ author: 'SELLER', status: 'PENDING', stakePct: 35 });
    expect(counter!.parentOfferId).toBe(first!.id);
  });

  it('serves the teaser image per visibility rules', async () => {
    const published = await db.opportunity.findFirstOrThrow({ where: { status: 'PUBLISHED' } });
    const draft = await db.opportunity.findFirstOrThrow({ where: { status: 'DRAFT' } });
    const buyer = { id: 'someone-else', role: 'BUYER' as const };
    const img = await resolveTeaserImage(buyer, published.id);
    expect(img.kind).toBe('svg');
    expect(img.kind === 'svg' && img.body.startsWith('<svg')).toBe(true);
    await expect(resolveTeaserImage(buyer, draft.id)).rejects.toThrow();
    expect((await resolveTeaserImage({ id: 'x', role: 'BACKOFFICE' }, draft.id)).kind).toBe('svg');
    expect(
      (await resolveTeaserImage({ id: draft.sellerId, role: 'SELLER' }, draft.id)).kind,
    ).toBe('svg');
    await expect(resolveTeaserImage(buyer, 'missing')).rejects.toThrow();
  });

  it('is idempotent: a second run adds no documents, offers or decisions', async () => {
    const storage = getStorage() as MemoryStorage;
    const snap = async () => ({
      docs: await db.document.count(),
      folders: await db.dataRoomFolder.count(),
      vis: await db.infoSectionVisibility.count(),
      evals: await db.evaluation.count(),
      items: await db.evaluationItem.count(),
      decisions: await db.reviewDecision.count(),
      requests: await db.accessRequest.count(),
      ndas: await db.ndaSignature.count(),
      deals: await db.deal.count(),
      offers: await db.offer.count(),
      objects: storage.objects.size,
    });
    const before = await snap();
    const summary = await seed(db);
    expect(await snap()).toEqual(before);
    expect(summary.journey?.documents).toBe(0);
    expect(summary.journey?.reviewDecisions).toBe(0);
  });
});
