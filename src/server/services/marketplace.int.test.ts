import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { millions } from '@/domain/money';
import { db } from '@/server/db';
import { resetAdaptersForTests } from '@/server/storage';
import { seed } from '../../../prisma/seed';
import { getTeaser, searchMarketplace } from './marketplace';

const actor = { id: 'buyer-test', role: 'BUYER' as const };

type Company = {
  legalName: string;
  nit: string;
  sector: string;
  department: string;
  type: string;
  revenue: bigint;
  ebitda: bigint;
};

async function published(): Promise<Company[]> {
  const rows = await db.opportunity.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      type: true,
      company: {
        select: {
          sector: true,
          department: true,
          organization: { select: { name: true, nit: true } },
          financialYears: { select: { year: true, revenue: true, ebitda: true } },
        },
      },
    },
  });
  return rows.map((r) => {
    const last = [...r.company.financialYears].sort((a, b) => b.year - a.year)[0]!;
    return {
      legalName: r.company.organization.name,
      nit: r.company.organization.nit,
      sector: r.company.sector,
      department: r.company.department,
      type: r.type,
      revenue: last.revenue,
      ebitda: last.ebitda,
    };
  });
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  process.env.STORAGE_DRIVER = 'memory';
  resetAdaptersForTests();
  await seed(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe('searchMarketplace', () => {
  it('lists every published opportunity and the KPIs', async () => {
    const all = await published();
    const res = await searchMarketplace(actor);
    expect(all.length).toBeGreaterThan(5);
    expect(res.total).toBe(all.length);
    expect(res.items).toHaveLength(all.length);
    expect(res.kpis.published).toBe(all.length);
    expect(res.kpis.verifiedBuyers).toBe(
      await db.user.count({ where: { role: 'BUYER', status: 'ENABLED' } }),
    );
    expect(res.kpis.inDueDiligence).toBe(
      await db.deal.count({ where: { status: 'DUE_DILIGENCE' } }),
    );
  });

  it('combines revenue, EBITDA, sector and type filters correctly', async () => {
    const all = await published();

    const rev = await searchMarketplace(actor, { revenue: 'R_5K_20K' });
    expect(rev.total).toBe(
      all.filter((c) => c.revenue >= millions(5000) && c.revenue < millions(20000)).length,
    );

    const ebi = await searchMarketplace(actor, { ebitda: 'E_OVER_5K' });
    expect(ebi.total).toBe(all.filter((c) => c.ebitda >= millions(5000)).length);

    const both = await searchMarketplace(actor, { revenue: 'R_OVER_50K', ebitda: 'E_OVER_5K' });
    expect(both.total).toBe(
      all.filter((c) => c.revenue >= millions(50000) && c.ebitda >= millions(5000)).length,
    );

    const sector = all[0]!.sector;
    const type = all[0]!.type;
    const combo = await searchMarketplace(actor, {
      sector: sector as never,
      type: type as never,
      revenue: 'R_5K_20K',
    });
    expect(combo.total).toBe(
      all.filter(
        (c) =>
          c.sector === sector &&
          c.type === type &&
          c.revenue >= millions(5000) &&
          c.revenue < millions(20000),
      ).length,
    );

    const dept = all[0]!.department;
    const byDept = await searchMarketplace(actor, { department: dept });
    expect(byDept.total).toBe(all.filter((c) => c.department === dept).length);
  });

  it('orders by score', async () => {
    const res = await searchMarketplace(actor, { order: 'score' });
    const scores = res.items.map((t) => t.evaluation?.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('never leaks legal names or NITs, and q does not search identity', async () => {
    const all = await published();
    const res = await searchMarketplace(actor);
    const json = JSON.stringify(res);
    for (const c of all) {
      expect(json).not.toContain(c.legalName);
      expect(json).not.toContain(c.legalName.replace(/\s+(S\.?A\.?S\.?|S\.?A\.?|LTDA\.?)$/i, ''));
      const digits = c.nit.replace(/\D/g, '');
      expect(json).not.toContain(digits.slice(0, 9));
      expect(json).not.toContain(c.nit);
    }
    const byName = await searchMarketplace(actor, {
      q: all[0]!.nit.replace(/\D/g, '').slice(0, 9),
    });
    expect(byName.total).toBe(0);
  });

  it('getTeaser is anonymous too and 404s for unknown ids', async () => {
    const buyer = await db.user.findUniqueOrThrow({
      where: { email: 'comprador@demo.ladorada.co' },
    });
    const all = await published();
    const first = (await searchMarketplace(actor)).items[0]!;
    const t = await getTeaser({ id: buyer.id, role: 'BUYER', status: 'ENABLED' }, first.id);
    const json = JSON.stringify(t);
    for (const c of all) {
      expect(json).not.toContain(c.legalName);
      expect(json).not.toContain(c.nit);
    }
    await expect(
      getTeaser({ id: buyer.id, role: 'BUYER', status: 'ENABLED' }, 'does-not-exist'),
    ).rejects.toThrow();
  });
});
