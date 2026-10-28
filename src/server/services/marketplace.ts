/**
 * Buyer marketplace (H1): search + teaser detail.
 *
 * Every opportunity that leaves this module goes through `toTeaser()`. The
 * Prisma query selects identity columns (legal name, NIT, city) ONLY because
 * `toTeaser` needs them to scrub free text; they are never part of the result.
 * Free-text search runs on the already-built teaser, never on identity.
 */
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@/domain/errors';
import type { AccessStatus } from '@/domain/machines/access';
import { millions } from '@/domain/money';
import type { OpportunityType } from '@/domain/opportunity';
import { canAccessConfidential } from '@/domain/policies/confidential';
import type { Sector } from '@/domain/sectors';
import { toTeaser, type Teaser, type TeaserSource } from '@/domain/teaser';
import type { SessionUser } from '@/server/auth/session';
import { db } from '@/server/db';

type Bucket = { key: string; label: string; min: bigint | null; max: bigint | null };

export const REVENUE_FILTERS = [
  { key: 'R_UNDER_5K', label: 'Menos de 5.000 M', min: null, max: millions(5000) },
  { key: 'R_5K_20K', label: '5.000 – 20.000 M', min: millions(5000), max: millions(20000) },
  { key: 'R_20K_50K', label: '20.000 – 50.000 M', min: millions(20000), max: millions(50000) },
  { key: 'R_OVER_50K', label: 'Más de 50.000 M', min: millions(50000), max: null },
] as const satisfies readonly Bucket[];
export const EBITDA_FILTERS = [
  { key: 'E_UNDER_1K', label: 'Menos de 1.000 M', min: null, max: millions(1000) },
  { key: 'E_1K_5K', label: '1.000 – 5.000 M', min: millions(1000), max: millions(5000) },
  { key: 'E_OVER_5K', label: 'Más de 5.000 M', min: millions(5000), max: null },
] as const satisfies readonly Bucket[];
export type RevenueFilter = (typeof REVENUE_FILTERS)[number]['key'];
export type EbitdaFilter = (typeof EBITDA_FILTERS)[number]['key'];

export const MARKETPLACE_ORDERS = ['recent', 'score'] as const;
export type MarketplaceOrder = (typeof MARKETPLACE_ORDERS)[number];

export type MarketplaceFilter = {
  sector?: Sector;
  department?: string;
  revenue?: RevenueFilter;
  ebitda?: EbitdaFilter;
  type?: OpportunityType;
  q?: string;
  order?: MarketplaceOrder;
};

export type MarketplaceResult = {
  items: Teaser[];
  total: number;
  kpis: { published: number; inDueDiligence: number; verifiedBuyers: number };
};

const inBucket = (v: bigint, b: Bucket) =>
  (b.min === null || v >= b.min) && (b.max === null || v < b.max);

const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const TEASER_SELECT = {
  id: true,
  title: true,
  type: true,
  objective: true,
  idealBuyerProfile: true,
  dealSizeMin: true,
  dealSizeMax: true,
  horizon: true,
  teaserImage: true,
  teaserImageKey: true,
  infoSections: { select: { section: true, inTeaser: true } },
  evaluation: { select: { valuationLow: true, valuationHigh: true, score: true } },
  company: {
    select: {
      sector: true,
      subsector: true,
      department: true,
      city: true,
      description: true,
      employeesRange: true,
      foundedYear: true,
      channels: true,
      capacity: true,
      organization: { select: { name: true, nit: true } },
      financialYears: { select: { year: true, revenue: true, ebitda: true } },
    },
  },
} satisfies Prisma.OpportunitySelect;

type Row = Prisma.OpportunityGetPayload<{ select: typeof TEASER_SELECT }>;

function rowToTeaser(row: Row): Teaser {
  const c = row.company;
  const source: TeaserSource = {
    id: row.id,
    title: row.title,
    type: row.type,
    objective: row.objective,
    idealBuyerProfile: row.idealBuyerProfile,
    dealSizeMin: row.dealSizeMin,
    dealSizeMax: row.dealSizeMax,
    horizon: row.horizon,
    sector: c.sector,
    subsector: c.subsector,
    department: c.department,
    city: c.city,
    legalName: c.organization.name,
    nit: c.organization.nit,
    description: c.description,
    employeesRange: c.employeesRange,
    foundedYear: c.foundedYear,
    channels: c.channels,
    capacity: c.capacity,
    financials: c.financialYears.map((f) => ({ year: f.year, revenue: f.revenue })),
    visibility: row.infoSections,
    // Same-origin route, authorized per request; never the stored data URL.
    teaserImageUrl:
      row.teaserImage || row.teaserImageKey ? `/api/opportunities/${row.id}/teaser-image` : null,
    evaluation: row.evaluation,
  };
  return toTeaser(source);
}

function lastYear(row: Row) {
  return [...row.company.financialYears].sort((a, b) => b.year - a.year)[0];
}

/** Published opportunities only; range filters use the last year; output is teasers. */
export async function searchMarketplace(
  actor: Pick<SessionUser, 'id' | 'role'>,
  filter: MarketplaceFilter = {},
): Promise<MarketplaceResult> {
  void actor;
  const where: Prisma.OpportunityWhereInput = {
    status: 'PUBLISHED',
    ...(filter.type ? { type: filter.type } : {}),
    company: {
      ...(filter.sector ? { sector: filter.sector } : {}),
      ...(filter.department ? { department: filter.department } : {}),
    },
  };

  const [rows, inDueDiligence, verifiedBuyers, published] = await Promise.all([
    db.opportunity.findMany({
      where,
      select: TEASER_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    }),
    db.deal.count({ where: { status: 'DUE_DILIGENCE' } }),
    db.user.count({ where: { role: 'BUYER', status: 'ENABLED' } }),
    db.opportunity.count({ where: { status: 'PUBLISHED' } }),
  ]);

  const rev: Bucket | undefined = REVENUE_FILTERS.find((f) => f.key === filter.revenue);
  const ebi: Bucket | undefined = EBITDA_FILTERS.find((f) => f.key === filter.ebitda);

  const kept = rows.filter((row) => {
    if (!rev && !ebi) return true;
    const ly = lastYear(row);
    if (!ly) return false;
    if (rev && !inBucket(ly.revenue, rev)) return false;
    if (ebi && !inBucket(ly.ebitda, ebi)) return false;
    return true;
  });

  let items = kept.map(rowToTeaser);

  const q = filter.q ? normalize(filter.q.trim()) : '';
  if (q) {
    items = items.filter((t) => {
      const haystack = [
        t.title,
        t.sectorLabel,
        t.department,
        ...Object.values(t.sections).map((s) => s?.text ?? ''),
      ].join(' ');
      return normalize(haystack).includes(q);
    });
  }

  if (filter.order === 'score') {
    items = items
      .map((t, i) => ({ t, i }))
      .sort((a, b) => (b.t.evaluation?.score ?? -1) - (a.t.evaluation?.score ?? -1) || a.i - b.i)
      .map((x) => x.t);
  }

  return { items, total: items.length, kpis: { published, inDueDiligence, verifiedBuyers } };
}

export type TeaserDetail = Teaser & {
  access: { status: AccessStatus | null; canOpenDataRoom: boolean };
  dealId: string | null;
};

/** 404 unless PUBLISHED (the owning seller and BACKOFFICE may see any status). */
export async function getTeaser(
  actor: Pick<SessionUser, 'id' | 'role' | 'status'>,
  id: string,
  now: Date = new Date(),
): Promise<TeaserDetail> {
  const row = await db.opportunity.findUnique({
    where: { id },
    select: { ...TEASER_SELECT, status: true, sellerId: true },
  });
  const allowed =
    row && (row.status === 'PUBLISHED' || row.sellerId === actor.id || actor.role === 'BACKOFFICE');
  if (!row || !allowed) throw new NotFoundError();

  const [access, deal] = await Promise.all([
    db.accessRequest.findUnique({
      where: { buyerId_opportunityId: { buyerId: actor.id, opportunityId: id } },
      select: {
        status: true,
        ndaSignatures: {
          select: { signedAt: true, expiresAt: true },
          orderBy: { signedAt: 'desc' },
          take: 1,
        },
      },
    }),
    db.deal.findFirst({
      where: { buyerId: actor.id, opportunityId: id },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const canOpenDataRoom = canAccessConfidential({
    user: { id: actor.id, role: actor.role, status: actor.status },
    opportunity: { sellerId: row.sellerId, status: row.status },
    access: access ? { status: access.status } : null,
    nda: access?.ndaSignatures[0] ?? null,
    now,
  });

  return {
    ...rowToTeaser(row),
    access: { status: access?.status ?? null, canOpenDataRoom },
    dealId: deal?.id ?? null,
  };
}
