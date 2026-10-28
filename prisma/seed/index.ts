import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/server/auth/password';
import { audited } from '../../src/server/audit/audited';
import { DEFAULT_SCORE_WEIGHTS, DEFAULT_SECTOR_MULTIPLES } from '../../src/domain/valuation';
import { millions } from '../../src/domain/money';
import { SEED_COMPANIES } from './data/companies';
import { DEMO_PASSWORD, SEED_USERS, type SeedUser } from './data/users';
import { getStorage } from '../../src/server/storage';
import { ADMIN_EMAIL, planVerification, type CasePlan } from './data/verification';
import { sampleFile } from './fixtures';
import { svgDataUrl, teaserSvg } from './teaser-art';

export type SeedSummary = {
  users: number;
  organizations: number;
  companies: number;
  financialYears: number;
  opportunities: number;
  settings: number;
  verificationCases: number;
};

const BUYER_TYPE = {
  FONDO: 'FUND',
  ESTRATEGICO: 'STRATEGIC',
  FAMILY_OFFICE: 'FAMILY_OFFICE',
  ANGEL: 'ANGEL',
} as const;

/** Public codenames (never the company name), one per seeded company in order. */
const CODENAMES = [
  'Aurora',
  'Cumbre',
  'Delta',
  'Esmeralda',
  'Faro',
  'Granito',
  'Horizonte',
  'Ícaro',
  'Jaguar',
  'Kairós',
  'Laurel',
  'Mirador',
  'Nébula',
  'Ópalo',
  'Páramo',
  'Quetzal',
];

const SETTINGS: Record<string, Prisma.InputJsonValue> = {
  sectorMultiples: DEFAULT_SECTOR_MULTIPLES as unknown as Prisma.InputJsonValue,
  scoreWeights: DEFAULT_SCORE_WEIGHTS as unknown as Prisma.InputJsonValue,
};

/** Idempotent: every row is upserted by its natural unique key. */
export async function seed(db: PrismaClient): Promise<SeedSummary> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const summary: SeedSummary = {
    users: 0,
    organizations: 0,
    companies: 0,
    financialYears: 0,
    opportunities: 0,
    settings: 0,
    verificationCases: 0,
  };

  // Verification cases: S3 puts happen BEFORE the transaction (keys need the case id, so new
  // cases get a pre-generated id). A failed transaction leaves harmless orphan objects.
  const plans = new Map<string, { plan: CasePlan; caseId: string; keys: Map<string, string> }>();
  for (const [i, u] of SEED_USERS.entries()) {
    const plan = planVerification(u, i);
    if (!plan) continue;
    const existingUser = await db.user.findUnique({
      where: { email: u.email },
      select: { id: true },
    });
    const existingCase = existingUser
      ? await db.verificationCase.findFirst({
          where: { userId: existingUser.id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { documents: { select: { type: true } } },
        })
      : null;
    const caseId = existingCase?.id ?? randomUUID();
    const have = new Set(existingCase?.documents.map((d) => d.type));
    const keys = new Map<string, string>();
    for (const doc of plan.documents) {
      if (have.has(doc.type)) continue;
      const file = sampleFile(doc.fixture);
      const key = `verification/${caseId}/${randomUUID()}`;
      await getStorage().put(key, file.bytes, file.mime);
      keys.set(doc.type, key);
    }
    plans.set(u.email, { plan, caseId, keys });
  }

  await audited(
    async (tx) => {
      // Organizations of the companies (NIT is the key) and the companies themselves.
      const orgByNit = new Map<string, string>();
      const orgIdByEmail = new Map<string, string>();
      const companyIdBySlug = new Map<string, string>();

      for (const c of SEED_COMPANIES) {
        const org = await tx.organization.upsert({
          where: { nit: c.nit },
          update: { name: c.legalName, kind: 'COMPANY' },
          create: { name: c.legalName, nit: c.nit, kind: 'COMPANY' },
        });
        orgByNit.set(c.nit, org.id);
        if (!orgIdByEmail.has(c.ownerEmail)) orgIdByEmail.set(c.ownerEmail, org.id);
        summary.organizations++;

        const data = {
          organizationId: org.id,
          sector: c.sector,
          subsector: c.subsector,
          foundedYear: c.foundedYear,
          employeesRange: c.employeesRange,
          department: c.department,
          city: c.city,
          description: c.description,
        };
        const company = await tx.company.upsert({
          where: { slug: c.slug },
          update: data,
          create: { slug: c.slug, ...data },
        });
        companyIdBySlug.set(c.slug, company.id);
        summary.companies++;

        for (const f of c.financials) {
          const amounts = {
            revenue: millions(f.revenue),
            ebitda: millions(f.ebitda),
            netIncome: millions(Math.round(f.ebitda * 0.55)),
          };
          await tx.companyFinancialYear.upsert({
            where: { companyId_year: { companyId: company.id, year: f.year } },
            update: amounts,
            create: { companyId: company.id, year: f.year, ...amounts },
          });
          summary.financialYears++;
        }
      }

      // Users (and their buyer / applicant organizations).
      const userIdByEmail = new Map<string, string>();
      for (const u of SEED_USERS) {
        let organizationId = orgIdByEmail.get(u.email) ?? null;
        if (!organizationId && u.organization) {
          organizationId = await upsertUserOrg(tx, u.organization, orgByNit);
          summary.organizations++;
        }
        const data = {
          phone: plans.get(u.email)?.plan.phone ?? null,
          name: u.name,
          role: u.role,
          status: u.status,
          passwordHash,
          organizationId,
          consentAt: new Date('2026-01-01T00:00:00Z'),
        };
        const user = await tx.user.upsert({
          where: { email: u.email },
          update: data,
          create: { email: u.email, ...data },
        });
        userIdByEmail.set(u.email, user.id);
        summary.users++;
      }

      // One verification case per BUYER / SELLER (find by userId, then update or create).
      const adminId = userIdByEmail.get(ADMIN_EMAIL);
      if (!adminId) throw new Error('Seed inconsistency: missing back office user');
      for (const [email, { plan, caseId, keys }] of plans) {
        const userId = userIdByEmail.get(email);
        if (!userId) throw new Error('Seed inconsistency: missing user for a verification case');
        const caseData = {
          step: plan.step,
          status: plan.status,
          profile: plan.profile as unknown as Prisma.InputJsonValue,
          isLegalRepresentative: plan.isLegalRepresentative,
          buyerType: plan.buyerType,
          submittedAt: plan.submittedAt,
          decidedAt: plan.decidedAt,
          decidedById: plan.decidedByAdmin ? adminId : null,
          correctionNotes: plan.correctionNotes,
          rejectionReason: plan.rejectionReason,
        };
        const found = await tx.verificationCase.findFirst({
          where: { userId },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const vc = found
          ? await tx.verificationCase.update({ where: { id: found.id }, data: caseData })
          : await tx.verificationCase.create({ data: { id: caseId, userId, ...caseData } });

        if ((await tx.kycChecklistItem.count({ where: { verificationCaseId: vc.id } })) === 0) {
          await tx.kycChecklistItem.createMany({
            data: plan.checklist.map((label) => ({
              verificationCaseId: vc.id,
              label,
              done: plan.kycDone,
              checkedById: plan.kycDone ? adminId : null,
              checkedAt: plan.kycDone ? plan.decidedAt : null,
            })),
          });
        }

        for (const doc of plan.documents) {
          const key = keys.get(doc.type);
          if (!key) continue;
          const exists = await tx.verificationDocument.findFirst({
            where: { verificationCaseId: vc.id, type: doc.type },
            select: { id: true },
          });
          if (exists) continue;
          await tx.verificationDocument.create({
            data: {
              verificationCaseId: vc.id,
              type: doc.type,
              storageKey: key,
              mime: sampleFile(doc.fixture).mime,
              size: sampleFile(doc.fixture).bytes.length,
              originalName: doc.originalName,
              reviewStatus: doc.reviewStatus,
            },
          });
        }
        summary.verificationCases++;
      }

      // One opportunity per company.
      for (const [i, c] of SEED_COMPANIES.entries()) {
        const companyId = companyIdBySlug.get(c.slug);
        const sellerId = userIdByEmail.get(c.ownerEmail);
        if (!companyId || !sellerId) throw new Error(`Seed inconsistency for ${c.slug}`);
        const last = c.financials[c.financials.length - 1];
        const base = last && last.ebitda > 0 ? last.ebitda * 5 : (last?.revenue ?? 1000);
        const published = c.status === 'PUBLISHED' || c.status === 'SUSPENDED';
        const data = {
          sellerId,
          title: `Proyecto ${CODENAMES[i % CODENAMES.length]}`,
          type: c.opportunityType,
          objective: c.description,
          dealSizeMin: millions(Math.round(base * 0.8)),
          dealSizeMax: millions(Math.round(base * 1.2)),
          horizon: '6 a 12 meses',
          idealBuyerProfile: 'Inversionista con experiencia en el sector y capacidad de cierre.',
          status: c.status,
          teaserImage: svgDataUrl(teaserSvg(c.sector, i + 1)),
          publishedAt: published ? new Date('2026-03-01T12:00:00Z') : null,
        };
        const existing = await tx.opportunity.findFirst({ where: { companyId } });
        if (existing) {
          await tx.opportunity.update({ where: { id: existing.id }, data });
        } else {
          await tx.opportunity.create({ data: { companyId, ...data } });
        }
        summary.opportunities++;
      }

      for (const [key, value] of Object.entries(SETTINGS)) {
        await tx.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        });
        summary.settings++;
      }

      return {
        result: summary,
        audit: {
          actorId: null,
          action: 'SEED_LOADED',
          entity: 'Seed',
          entityId: 'demo',
          after: summary,
        },
      };
    },
    { client: db, timeout: 120_000, maxWait: 30_000 },
  );

  return summary;
}

async function upsertUserOrg(
  tx: Prisma.TransactionClient,
  o: NonNullable<SeedUser['organization']>,
  orgByNit: Map<string, string>,
): Promise<string> {
  const known = orgByNit.get(o.nit);
  if (known) return known;
  const buyerType = o.buyerType ? BUYER_TYPE[o.buyerType] : null;
  const org = await tx.organization.upsert({
    where: { nit: o.nit },
    update: { name: o.name, kind: o.kind, buyerType },
    create: { name: o.name, nit: o.nit, kind: o.kind, buyerType },
  });
  orgByNit.set(o.nit, org.id);
  return org.id;
}

// CLI entry: `tsx prisma/seed/index.ts`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new PrismaClient();
  seed(client)
    .then((s) => console.log('Seed loaded:', s))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => client.$disconnect());
}
