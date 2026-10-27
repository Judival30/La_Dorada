import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { verifyAuditChain } from '@/server/audit/audit';
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
});

afterAll(async () => {
  await db.$disconnect();
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
    await seed(db);
    expect(await counts()).toEqual(before);
    expect((await verifyAuditChain(db)).ok).toBe(true);
    expect(await db.auditLog.count({ where: { action: 'SEED_LOADED' } })).toBe(2);
  });
});
