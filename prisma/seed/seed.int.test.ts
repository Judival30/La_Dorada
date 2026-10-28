import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
