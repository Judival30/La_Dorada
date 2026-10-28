import { randomUUID } from 'node:crypto';
import type { EvaluationItemKind, EvaluationItemStatus, Prisma, PrismaClient } from '@prisma/client';
import { DATA_ROOM_FOLDERS, documentaryStatus, toScoreInput } from '../../src/domain/evaluation';
import { millions } from '../../src/domain/money';
import {
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_SECTOR_MULTIPLES,
  computeScore,
  valuationRange,
  type ScoreWeights,
  type SectorMultiples,
} from '../../src/domain/valuation';
import { defaultVisibility } from '../../src/domain/visibility';
import { NDA_HASH } from '../../src/content/nda';
import { recordDecision } from '../../src/server/services/review-decisions';
import { getStorage } from '../../src/server/storage';
import { sampleFile } from './fixtures';

export type JourneySummary = {
  documents: number;
  evaluations: number;
  reviewDecisions: number;
  accessRequests: number;
  deals: number;
  offers: number;
};

export const DEMO_BUYER_EMAIL = 'comprador@demo.ladorada.co';
export const SECOND_BUYER_EMAIL = 'inversiones.pacifico@demo.ladorada.co';
export const ADVANCED_SLUG = 'cafes-de-antioquia';
const ADMIN_EMAIL = 'admin@demo.ladorada.co';

const DAY = 86_400_000;

/** Fictional PDF names per data room folder (1–3 are uploaded per required folder). */
const DOC_NAMES: Record<string, string[]> = {
  'Estados financieros': [
    'Estados financieros 2025.pdf',
    'Estados financieros 2024.pdf',
    'Notas a los estados financieros.pdf',
  ],
  'Declaraciones tributarias': [
    'Declaración de renta 2024.pdf',
    'Declaración de IVA 2025.pdf',
    'Certificado de paz y salvo tributario.pdf',
  ],
  Contratos: [
    'Contrato marco con clientes.pdf',
    'Contrato de arrendamiento de planta.pdf',
    'Acuerdo con proveedor principal.pdf',
  ],
  Clientes: [
    'Cartera de clientes por segmento.pdf',
    'Concentración de ventas 2025.pdf',
    'Condiciones comerciales vigentes.pdf',
  ],
  Proveedores: [
    'Listado de proveedores clave.pdf',
    'Condiciones de pago a proveedores.pdf',
    'Evaluación de proveedores.pdf',
  ],
  'Capex y activos fijos': [
    'Inventario de activos fijos.pdf',
    'Plan de inversiones 2026.pdf',
    'Avalúo de maquinaria.pdf',
  ],
};

/** [FINANCIAL_CONSISTENCY, CUSTOMER_DEPENDENCY, LEGAL_CONTINGENCIES] per evaluated company. */
const MATRIX: Record<string, [EvaluationItemStatus, EvaluationItemStatus, EvaluationItemStatus]> = {
  'cafes-de-antioquia': ['APPROVED', 'APPROVED', 'APPROVED'],
  'logistica-caribe': ['APPROVED', 'MEDIUM_RISK', 'APPROVED'],
  'tecnipagos-pyme': ['APPROVED', 'APPROVED', 'MEDIUM_RISK'],
  agroandina: ['APPROVED', 'MEDIUM_RISK', 'APPROVED'],
  'textiles-santa-rosa': ['APPROVED', 'APPROVED', 'APPROVED'],
  'clinica-andina-del-sur': ['APPROVED', 'APPROVED', 'MEDIUM_RISK'],
  'constructora-montebello': ['APPROVED', 'MEDIUM_RISK', 'MEDIUM_RISK'],
  'retail-pacifico-hogar': ['APPROVED', 'APPROVED', 'APPROVED'],
  'energia-solar-bolivar': ['APPROVED', 'APPROVED', 'MEDIUM_RISK'],
  'software-nubia': ['APPROVED', 'MEDIUM_RISK', 'APPROVED'],
  'crediagil-caldas': ['APPROVED', 'APPROVED', 'APPROVED'],
  'panela-miraflores': ['APPROVED', 'MEDIUM_RISK', 'HIGH_RISK'],
};

const ITEM_NOTES: Record<EvaluationItemStatus, string> = {
  COMPLETED: 'Todas las carpetas requeridas tienen documentos.',
  APPROVED: 'Sin hallazgos relevantes.',
  MEDIUM_RISK: 'Hallazgo moderado; se recomienda aclararlo en la debida diligencia.',
  TO_CLARIFY: 'Pendiente de aclaración por parte del vendedor.',
  HIGH_RISK: 'Hallazgo relevante; condiciona la oportunidad.',
};

/**
 * Second seed phase (after companies, users and opportunities exist): data
 * rooms, visibility, evaluations, review decisions and the advanced demo
 * process. Idempotent: every row is found or upserted by its natural key and
 * uploads are skipped when the folder already holds a document of that name.
 */
export async function seedJourney(db: PrismaClient): Promise<JourneySummary> {
  const summary: JourneySummary = {
    documents: 0,
    evaluations: 0,
    reviewDecisions: 0,
    accessRequests: 0,
    deals: 0,
    offers: 0,
  };
  const now = new Date();

  const [multiplesRow, weightsRow] = await Promise.all([
    db.setting.findUnique({ where: { key: 'sectorMultiples' } }),
    db.setting.findUnique({ where: { key: 'scoreWeights' } }),
  ]);
  const multiples =
    (multiplesRow?.value as unknown as Record<string, SectorMultiples> | undefined) ??
    DEFAULT_SECTOR_MULTIPLES;
  const weights = (weightsRow?.value as unknown as ScoreWeights | undefined) ?? DEFAULT_SCORE_WEIGHTS;

  const admin = await db.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  const opps = await db.opportunity.findMany({
    include: { company: { include: { financialYears: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const opp of opps) {
    const slug = opp.company.slug;

    // Folders (required flag from DATA_ROOM_FOLDERS).
    const folderByName = new Map<string, { id: string; required: boolean }>();
    for (const f of DATA_ROOM_FOLDERS) {
      const folder = await db.dataRoomFolder.upsert({
        where: { opportunityId_name: { opportunityId: opp.id, name: f.name } },
        update: { required: f.required, position: f.position },
        create: {
          opportunityId: opp.id,
          name: f.name,
          required: f.required,
          position: f.position,
        },
      });
      folderByName.set(f.name, { id: folder.id, required: f.required });
    }

    // Documents: DRAFT is incomplete (first two required folders only).
    const requiredNames = DATA_ROOM_FOLDERS.filter((f) => f.required).map((f) => f.name);
    const filled = opp.status === 'DRAFT' ? requiredNames.slice(0, 2) : requiredNames;
    const reviewStatus = opp.status === 'IN_REVIEW' || opp.status === 'DRAFT' ? 'PENDING' : 'APPROVED';
    for (const [fi, folderName] of filled.entries()) {
      const folder = folderByName.get(folderName)!;
      const names = DOC_NAMES[folderName] ?? [];
      const count = 1 + ((opps.indexOf(opp) + fi) % 3);
      for (const name of names.slice(0, count)) {
        const exists = await db.document.findFirst({
          where: { folderId: folder.id, name },
          select: { id: true },
        });
        if (exists) continue;
        const file = sampleFile('pdf');
        const key = `dataroom/${opp.id}/${randomUUID()}`;
        await getStorage().put(key, file.bytes, file.mime);
        await db.document.create({
          data: {
            opportunityId: opp.id,
            folderId: folder.id,
            uploadedById: opp.sellerId,
            name,
            storageKey: key,
            mime: file.mime,
            size: file.bytes.length,
            confidential: true,
            reviewStatus,
          },
        });
        summary.documents++;
      }
    }

    // Visibility (defaults of slide10).
    for (const v of defaultVisibility()) {
      await db.infoSectionVisibility.upsert({
        where: { opportunityId_section: { opportunityId: opp.id, section: v.section } },
        update: { inTeaser: v.inTeaser, inDataRoom: v.inDataRoom },
        create: { opportunityId: opp.id, ...v },
      });
    }

    // Evaluation: PUBLISHED / SUSPENDED only. IN_REVIEW ones are evaluated live in the demo.
    if (opp.status === 'PUBLISHED' || opp.status === 'SUSPENDED') {
      const matrix = (slug ? MATRIX[slug] : undefined) ??['APPROVED', 'APPROVED', 'APPROVED'];
      const delivered = await deliveredRequired(db, opp.id);
      const required = requiredNames.length;
      const kinds: [EvaluationItemKind, EvaluationItemStatus][] = [
        ['DOCUMENTARY', documentaryStatus(delivered, required)],
        ['FINANCIAL_CONSISTENCY', matrix[0]],
        ['CUSTOMER_DEPENDENCY', matrix[1]],
        ['LEGAL_CONTINGENCIES', matrix[2]],
      ];
      const sorted = [...opp.company.financialYears].sort((a, b) => a.year - b.year);
      const last = sorted[sorted.length - 1];
      if (!last) throw new Error(`Seed inconsistency: no financials for ${slug}`);
      const input = toScoreInput({
        items: kinds.map(([kind, status]) => ({ kind, status })),
        foldersDelivered: delivered,
        foldersRequired: required,
        financials: sorted,
      });
      const range = valuationRange(
        { revenue: last.revenue, ebitda: last.ebitda, cagr3y: input.cagr3y },
        multiples[opp.company.sector] ?? DEFAULT_SECTOR_MULTIPLES[opp.company.sector],
      );
      const score = computeScore(input, weights);
      const data = {
        valuationLow: range.low,
        valuationHigh: range.high,
        score: score.total,
        docsDelivered: delivered,
        docsRequired: required,
        breakdown: score.breakdown as unknown as Prisma.InputJsonValue,
      };
      const evaluation = await db.evaluation.upsert({
        where: { opportunityId: opp.id },
        update: data,
        create: { opportunityId: opp.id, ...data },
      });
      for (const [kind, status] of kinds) {
        const item = { status, notes: ITEM_NOTES[status] };
        await db.evaluationItem.upsert({
          where: { evaluationId_kind: { evaluationId: evaluation.id, kind } },
          update: item,
          create: { evaluationId: evaluation.id, kind, ...item },
        });
      }
      summary.evaluations++;

      summary.reviewDecisions += await decide(db, 'OPPORTUNITY', opp.id, 'APPROVE', admin.id);
      if (opp.status === 'SUSPENDED') {
        summary.reviewDecisions += await decide(
          db,
          'OPPORTUNITY',
          opp.id,
          'SUSPEND',
          admin.id,
          'Suspendida mientras se resuelve el proceso de sucesión de la empresa.',
        );
      }
    }
  }

  // Decisions on users (from the seeded verification cases).
  const users = await db.user.findMany({
    where: { role: { in: ['BUYER', 'SELLER'] } },
    include: { verificationCases: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  for (const u of users) {
    const vc = u.verificationCases[0];
    switch (u.status) {
      case 'ENABLED':
        summary.reviewDecisions += await decide(db, 'USER', u.id, 'APPROVE', admin.id);
        break;
      case 'BLOCKED':
        summary.reviewDecisions += await decide(db, 'USER', u.id, 'APPROVE', admin.id);
        summary.reviewDecisions += await decide(
          db,
          'USER',
          u.id,
          'BLOCK',
          admin.id,
          u.blockedReason,
        );
        break;
      case 'CORRECTIONS_REQUESTED':
        summary.reviewDecisions += await decide(
          db,
          'USER',
          u.id,
          'REQUEST_CORRECTIONS',
          admin.id,
          vc?.correctionNotes,
        );
        break;
      case 'REJECTED':
        summary.reviewDecisions += await decide(
          db,
          'USER',
          u.id,
          'REJECT',
          admin.id,
          vc?.rejectionReason,
        );
        break;
      default:
        break;
    }
  }

  await seedAdvancedProcess(db, summary, now);
  return summary;
}

async function deliveredRequired(db: PrismaClient, opportunityId: string): Promise<number> {
  const folders = await db.dataRoomFolder.findMany({
    where: { opportunityId, required: true },
    select: { _count: { select: { documents: true } } },
  });
  return folders.filter((f) => f._count.documents > 0).length;
}

/** Creates the decision unless one of that kind already exists. Returns 1 if created. */
async function decide(
  db: PrismaClient,
  subjectType: 'USER' | 'OPPORTUNITY',
  subjectId: string,
  kind: 'APPROVE' | 'REQUEST_CORRECTIONS' | 'REJECT' | 'BLOCK' | 'SUSPEND',
  actorId: string,
  text?: string | null,
): Promise<number> {
  const exists = await db.reviewDecision.findFirst({
    where: { subjectType, subjectId, kind },
    select: { id: true },
  });
  if (exists) return 0;
  await db.$transaction((tx) =>
    recordDecision(tx, { subjectType, subjectId, kind, text: text ?? null, actorId }),
  );
  return 1;
}

async function seedAdvancedProcess(
  db: PrismaClient,
  summary: JourneySummary,
  now: Date,
): Promise<void> {
  const company = await db.company.findUniqueOrThrow({ where: { slug: ADVANCED_SLUG } });
  const opp = await db.opportunity.findFirstOrThrow({ where: { companyId: company.id } });
  const seller = await db.user.findUniqueOrThrow({ where: { id: opp.sellerId } });
  const buyer = await db.user.findUniqueOrThrow({ where: { email: DEMO_BUYER_EMAIL } });
  const second = await db.user.findUniqueOrThrow({ where: { email: SECOND_BUYER_EMAIL } });

  // Buyer 1: AUTHORIZED, NDA signed 10 days ago (valid 1 year).
  const authorized = await upsertRequest(db, buyer.id, opp.id, {
    status: 'AUTHORIZED',
    relevance: 92,
    purpose:
      'Fondo de inversión con foco en alimentos y bebidas. Buscamos una participación minoritaria con derechos de gobierno y acompañar la expansión de la planta y de los canales de distribución.',
  });
  await ensureNda(db, authorized.id, new Date(now.getTime() - 10 * DAY));
  summary.accessRequests++;

  // Buyer 2: NDA signed, waiting for the seller's authorization (H10).
  const pending = await upsertRequest(db, second.id, opp.id, {
    status: 'NDA_SIGNED',
    relevance: 78,
    purpose:
      'Family office interesado en diversificar hacia alimentos de valor agregado. Queremos conocer la estructura de costos y la capacidad instalada antes de presentar una oferta.',
  });
  await ensureNda(db, pending.id, new Date(now.getTime() - 2 * DAY));
  summary.accessRequests++;

  // Deal in negotiation: buyer offer (countered) + seller counter-offer (pending).
  let deal = await db.deal.findFirst({ where: { opportunityId: opp.id, buyerId: buyer.id } });
  if (!deal) {
    deal = await db.deal.create({
      data: {
        opportunityId: opp.id,
        buyerId: buyer.id,
        status: 'COUNTER_OFFER',
        stage: 'NEGOTIATION',
      },
    });
  }
  summary.deals++;
  const offerCount = await db.offer.count({ where: { dealId: deal.id } });
  if (offerCount === 0) {
    const first = await db.offer.create({
      data: {
        dealId: deal.id,
        author: 'BUYER',
        authorId: buyer.id,
        preMoneyValue: millions(25_000),
        stakePct: 40,
        investmentType: 'Socio estratégico',
        paymentScheme: '70% al cierre / 30% a 12 meses',
        exclusivityDays: 90,
        validUntil: new Date(now.getTime() + 30 * DAY),
        status: 'COUNTERED',
        createdAt: new Date(now.getTime() - 6 * DAY),
      },
    });
    await db.offer.create({
      data: {
        dealId: deal.id,
        parentOfferId: first.id,
        author: 'SELLER',
        authorId: seller.id,
        preMoneyValue: millions(25_000),
        stakePct: 35,
        investmentType: 'Socio estratégico',
        paymentScheme: '60% al cierre / 40% a 18 meses',
        exclusivityDays: 60,
        validUntil: new Date(now.getTime() + 20 * DAY),
        status: 'PENDING',
        createdAt: new Date(now.getTime() - 3 * DAY),
      },
    });
  }
  summary.offers += await db.offer.count({ where: { dealId: deal.id } });
}

async function upsertRequest(
  db: PrismaClient,
  buyerId: string,
  opportunityId: string,
  data: { status: 'AUTHORIZED' | 'NDA_SIGNED'; relevance: number; purpose: string },
) {
  return db.accessRequest.upsert({
    where: { buyerId_opportunityId: { buyerId, opportunityId } },
    update: data,
    create: { buyerId, opportunityId, ...data },
  });
}

async function ensureNda(db: PrismaClient, accessRequestId: string, signedAt: Date): Promise<void> {
  const exists = await db.ndaSignature.findFirst({
    where: { accessRequestId },
    select: { id: true },
  });
  if (exists) return;
  await db.ndaSignature.create({
    data: {
      accessRequestId,
      documentHash: NDA_HASH,
      signedAt,
      expiresAt: new Date(signedAt.getTime() + 365 * DAY),
    },
  });
}
