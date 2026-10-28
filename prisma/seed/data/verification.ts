import {
  DEFAULT_KYC_CHECKLIST,
  PROFILE_SCHEMAS,
  requiredDocuments,
  type BuyerType,
  type ProfileData,
  type ReviewStatus,
  type VerificationDocumentType,
} from '../../../src/domain/onboarding';
import type { Sector } from '../../../src/domain/sectors';
import { SEED_COMPANIES } from './companies';
import type { SeedUser } from './users';

/** Verification case planned for one seeded BUYER / SELLER. Pure data, no DB. */
export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'CORRECTIONS_REQUESTED' | 'APPROVED' | 'REJECTED';

export type PlannedDocument = {
  type: VerificationDocumentType;
  reviewStatus: ReviewStatus;
  fixture: 'pdf' | 'png';
  originalName: string;
};

export type CasePlan = {
  status: CaseStatus;
  step: number;
  profile: Partial<ProfileData>;
  phone: string;
  isLegalRepresentative: boolean | null;
  buyerType: BuyerType | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  /** Decided by the demo back office account. */
  decidedByAdmin: boolean;
  correctionNotes: string | null;
  rejectionReason: string | null;
  documents: PlannedDocument[];
  /** KYC items done, checked by the demo back office account. */
  kycDone: boolean;
  checklist: string[];
};

export const ADMIN_EMAIL = 'admin@demo.ladorada.co';

const BUYER_TYPE_MAP = {
  FONDO: 'FUND',
  ESTRATEGICO: 'STRATEGIC',
  FAMILY_OFFICE: 'FAMILY_OFFICE',
  ANGEL: 'ANGEL',
} as const;

/** Company data for seller applicants that own no company in SEED_COMPANIES. */
const APPLICANT_COMPANY: Record<string, { sector: Sector; department: string; city: string }> = {
  'gustavo.ariza@demo.ladorada.co': {
    sector: 'AGROINDUSTRIA',
    department: 'Santander',
    city: 'Bucaramanga',
  },
  'sandra.cardenas@demo.ladorada.co': {
    sector: 'MANUFACTURA',
    department: 'Antioquia',
    city: 'Medellín',
  },
  'ricardo.villamizar@demo.ladorada.co': {
    sector: 'SALUD',
    department: 'Cundinamarca',
    city: 'Chía',
  },
  'lorena.ospina@demo.ladorada.co': {
    sector: 'RETAIL',
    department: 'Norte de Santander',
    city: 'Cúcuta',
  },
  'mauricio.penaloza@demo.ladorada.co': {
    sector: 'ENERGIA',
    department: 'Boyacá',
    city: 'Tunja',
  },
  'diana.lozano@demo.ladorada.co': {
    sector: 'ALIMENTOS_BEBIDAS',
    department: 'Valle del Cauca',
    city: 'Cali',
  },
};

/** Sellers who are not the legal representative (they need a POWER_OF_ATTORNEY). */
const NOT_LEGAL_REP = new Set(['diana.lozano@demo.ladorada.co']);

const DOC_FILES: Record<VerificationDocumentType, { name: string; fixture: 'pdf' | 'png' }> = {
  NATIONAL_ID: { name: 'cedula-demo.png', fixture: 'png' },
  CHAMBER_OF_COMMERCE: { name: 'camara-comercio-demo.pdf', fixture: 'pdf' },
  RUT: { name: 'rut-demo.pdf', fixture: 'pdf' },
  POWER_OF_ATTORNEY: { name: 'poder-demo.pdf', fixture: 'pdf' },
};

const CORRECTION_NOTES = 'El RUT está desactualizado; sube la versión 2025.';
const REJECTION_REASON =
  'No fue posible verificar la existencia de la empresa con los soportes aportados.';

type Steps = {
  step1: ProfileData['step1'];
  step3: ProfileData['step3'];
  step4: ProfileData['step4'];
  isLegalRepresentative: boolean | null;
  buyerType: BuyerType | null;
};

function stepData(u: SeedUser, index: number): Steps {
  const step1 = PROFILE_SCHEMAS.step1.parse({
    name: u.name,
    phone: `+57 300 555 ${String(1000 + index).slice(-4)}`,
    position: u.role === 'SELLER' ? 'Representante legal' : 'Director de inversiones',
  });

  if (u.role === 'SELLER') {
    const isRep = !NOT_LEGAL_REP.has(u.email);
    const company = SEED_COMPANIES.find((c) => c.ownerEmail === u.email);
    const org = u.organization;
    const fallback = APPLICANT_COMPANY[u.email];
    const src = company
      ? {
          legalName: company.legalName,
          nit: company.nit,
          sector: company.sector,
          department: company.department,
          city: company.city,
        }
      : org && fallback
        ? { legalName: org.name, nit: org.nit, ...fallback }
        : null;
    if (!src) throw new Error(`Seed inconsistency: no company data for ${u.email}`);
    return {
      step1: { ...step1, position: isRep ? 'Representante legal' : 'Apoderado' },
      step3: PROFILE_SCHEMAS.step3Seller.parse({ isLegalRepresentative: isRep }),
      step4: PROFILE_SCHEMAS.step4Seller.parse(src),
      isLegalRepresentative: isRep,
      buyerType: null,
    };
  }

  const org = u.organization;
  const buyerType: BuyerType = org?.buyerType ? BUYER_TYPE_MAP[org.buyerType] : 'ANGEL';
  const step3 =
    buyerType === 'ANGEL'
      ? { buyerType }
      : { buyerType, entityName: org?.name, entityNit: org?.nit };
  return {
    step1,
    step3: PROFILE_SCHEMAS.step3Buyer.parse(step3),
    step4: PROFILE_SCHEMAS.step4Buyer.parse({
      sectors: ['ALIMENTOS_BEBIDAS', 'AGROINDUSTRIA', 'LOGISTICA'],
      regions: ['Antioquia', 'Valle del Cauca', 'Bogotá D.C.'],
      ticketMinMillions: 2000,
      ticketMaxMillions: 15000,
    }),
    isLegalRepresentative: null,
    buyerType,
  };
}

/** Case planned for a seeded user, or `null` for BACKOFFICE accounts. */
export function planVerification(u: SeedUser, index: number): CasePlan | null {
  if (u.role !== 'BUYER' && u.role !== 'SELLER') return null;
  const d = stepData(u, index);
  const day = (n: number) => new Date(Date.UTC(2026, 1, n, 15, 0, 0));
  const recent = new Date(Date.UTC(2026, 9, 1 + (index % 20), 15, 0, 0));
  const required = requiredDocuments({
    role: u.role,
    isLegalRepresentative: d.isLegalRepresentative,
    buyerType: d.buyerType,
  });
  const docs = (status: (t: VerificationDocumentType) => ReviewStatus): PlannedDocument[] =>
    required.map((type) => ({
      type,
      reviewStatus: status(type),
      fixture: DOC_FILES[type].fixture,
      originalName: DOC_FILES[type].name,
    }));
  const base = {
    profile: { step1: d.step1, step3: d.step3, step4: d.step4 } as Partial<ProfileData>,
    phone: d.step1.phone,
    isLegalRepresentative: d.isLegalRepresentative,
    buyerType: d.buyerType,
    checklist: [...DEFAULT_KYC_CHECKLIST],
    decidedByAdmin: false,
    decidedAt: null,
    correctionNotes: null,
    rejectionReason: null,
    kycDone: false,
    step: 6,
  };

  switch (u.status) {
    case 'ENABLED':
    case 'BLOCKED':
      return {
        ...base,
        status: 'APPROVED',
        submittedAt: day(1),
        decidedAt: day(5),
        decidedByAdmin: true,
        kycDone: true,
        documents: docs(() => 'APPROVED'),
      };
    case 'IN_REVIEW':
      return {
        ...base,
        status: 'IN_REVIEW',
        submittedAt: recent,
        documents: docs(() => 'PENDING'),
      };
    case 'CORRECTIONS_REQUESTED': {
      const rejected = required.includes('RUT') ? 'RUT' : 'NATIONAL_ID';
      return {
        ...base,
        status: 'CORRECTIONS_REQUESTED',
        submittedAt: recent,
        decidedAt: recent,
        decidedByAdmin: true,
        correctionNotes: CORRECTION_NOTES,
        documents: docs((t) => (t === rejected ? 'REJECTED' : 'PENDING')),
      };
    }
    case 'REJECTED':
      return {
        ...base,
        status: 'REJECTED',
        submittedAt: recent,
        decidedAt: recent,
        decidedByAdmin: true,
        rejectionReason: REJECTION_REASON,
        documents: docs((t) => (t === 'NATIONAL_ID' ? 'REJECTED' : 'PENDING')),
      };
    default:
      // PENDING: wizard started, only step 1 saved.
      return {
        ...base,
        status: 'OPEN',
        step: 1,
        profile: { step1: d.step1 },
        isLegalRepresentative: null,
        buyerType: null,
        submittedAt: null,
        documents: [],
      };
  }
}
