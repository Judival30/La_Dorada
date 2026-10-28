/**
 * Onboarding / accreditation wizard rules (pure domain, no Prisma at runtime).
 * Which documents are required, per-step progress and what is missing and why.
 */
import { z } from 'zod';
import { SECTORS } from './sectors';

// Mirrors of Prisma enums (pinned by src/server/db/enums.test.ts).
export const VERIFICATION_DOCUMENT_TYPES = [
  'NATIONAL_ID',
  'CHAMBER_OF_COMMERCE',
  'RUT',
  'POWER_OF_ATTORNEY',
] as const;
export type VerificationDocumentType = (typeof VERIFICATION_DOCUMENT_TYPES)[number];

export const BUYER_TYPES = ['FUND', 'STRATEGIC', 'FAMILY_OFFICE', 'ANGEL'] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type OnboardingRole = 'BUYER' | 'SELLER';
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;

export const ONBOARDING_STEPS: Record<
  OnboardingRole,
  { step: OnboardingStep; title: string; description: string }[]
> = {
  SELLER: [
    { step: 1, title: 'Tu perfil personal', description: 'Información básica del representante.' },
    {
      step: 2,
      title: 'Verificación de identidad',
      description: 'Verifica tu identidad con tu documento de identificación.',
    },
    {
      step: 3,
      title: 'Representación legal',
      description: 'Confirma que estás autorizado para actuar en nombre de la empresa.',
    },
    {
      step: 4,
      title: 'Información de la empresa',
      description: 'Información de la empresa que representas.',
    },
    {
      step: 5,
      title: 'Documentos de soporte',
      description: 'Adjunta los documentos requeridos por la plataforma.',
    },
    {
      step: 6,
      title: 'Revisión y aprobación',
      description: 'Revisamos tu información. Te notificaremos cuando tu cuenta esté lista.',
    },
  ],
  BUYER: [
    { step: 1, title: 'Tu perfil', description: 'Información básica del inversionista.' },
    {
      step: 2,
      title: 'Verificación de identidad',
      description: 'Verifica tu identidad con tu documento de identificación.',
    },
    {
      step: 3,
      title: 'A quién representas',
      description: 'Indica si inviertes a título personal o en nombre de una entidad.',
    },
    {
      step: 4,
      title: 'Criterios de inversión',
      description: 'Sectores, regiones y tamaño de ticket que te interesan.',
    },
    {
      step: 5,
      title: 'Documentos de soporte',
      description: 'Adjunta los documentos requeridos por la plataforma.',
    },
    {
      step: 6,
      title: 'Revisión y aprobación',
      description: 'Revisamos tu información. Te notificaremos cuando tu cuenta esté lista.',
    },
  ],
};

export const DOCUMENT_LABELS: Record<VerificationDocumentType, string> = {
  NATIONAL_ID: 'Cédula de ciudadanía',
  CHAMBER_OF_COMMERCE: 'Certificado de Cámara de Comercio',
  RUT: 'RUT',
  POWER_OF_ATTORNEY: 'Poder o autorización',
};

export const DEFAULT_KYC_CHECKLIST: string[] = [
  'Identidad verificada contra el documento',
  'Representación legal verificada',
  'Consulta en listas restrictivas (SARLAFT) sin coincidencias',
  'Documentos legibles y vigentes',
];

/** The 32 Colombian departments plus Bogotá D.C. */
export const DEPARTMENTS = [
  'Amazonas',
  'Antioquia',
  'Arauca',
  'Atlántico',
  'Bogotá D.C.',
  'Bolívar',
  'Boyacá',
  'Caldas',
  'Caquetá',
  'Casanare',
  'Cauca',
  'Cesar',
  'Chocó',
  'Córdoba',
  'Cundinamarca',
  'Guainía',
  'Guaviare',
  'Huila',
  'La Guajira',
  'Magdalena',
  'Meta',
  'Nariño',
  'Norte de Santander',
  'Putumayo',
  'Quindío',
  'Risaralda',
  'San Andrés y Providencia',
  'Santander',
  'Sucre',
  'Tolima',
  'Valle del Cauca',
  'Vaupés',
  'Vichada',
] as const;

// ───────────────────────────── Schemas ─────────────────────────────

const NIT_REGEX = /^\d{3}\.\d{3}\.\d{3}-\d$/;
const nit = z.string().regex(NIT_REGEX, 'NIT inválido. Usa el formato 900.123.456-7');

/** '+57 3xx xxx xxxx' (spaces tolerated, prefix optional) → '+573xxxxxxxxx'. */
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^(\+57)?3\d{9}$/, 'Celular inválido. Usa el formato +57 300 123 4567'))
  .transform((v) => (v.startsWith('+57') ? v : `+57${v}`));

const sectorEnum = z.enum(SECTORS);
const buyerTypeEnum = z.enum(BUYER_TYPES);
/** Step 4 locations must be one of the 33 DEPARTMENTS (Task 2 review carry-over). */
const departmentEnum = z.enum(DEPARTMENTS, { error: 'Selecciona un departamento de la lista' });

const step3Buyer = z
  .object({
    buyerType: buyerTypeEnum,
    entityName: z.string().trim().min(2).max(160).optional(),
    entityNit: nit.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.buyerType === 'ANGEL') return;
    if (!v.entityName) {
      ctx.addIssue({
        code: 'custom',
        path: ['entityName'],
        message: 'Indica el nombre de la entidad',
      });
    }
    if (!v.entityNit) {
      ctx.addIssue({ code: 'custom', path: ['entityNit'], message: 'Indica el NIT de la entidad' });
    }
  });

const step4Buyer = z
  .object({
    sectors: z.array(sectorEnum).min(1),
    regions: z.array(departmentEnum).min(1),
    ticketMinMillions: z.number().int().min(0),
    ticketMaxMillions: z.number().int().min(0),
  })
  .refine((v) => v.ticketMaxMillions >= v.ticketMinMillions, {
    path: ['ticketMaxMillions'],
    message: 'El ticket máximo debe ser mayor o igual al mínimo',
  });

export const PROFILE_SCHEMAS = {
  step1: z.object({
    name: z.string().trim().min(2).max(120),
    phone,
    position: z.string().trim().min(2).max(80),
  }),
  step3Seller: z.object({ isLegalRepresentative: z.boolean() }),
  step3Buyer,
  step4Seller: z.object({
    legalName: z.string().trim().min(2).max(160),
    nit,
    sector: sectorEnum,
    department: departmentEnum,
    city: z.string().trim().min(1).max(80),
  }),
  step4Buyer,
};

/** Stored in `VerificationCase.profile`, keyed by wizard step. */
export type ProfileData = {
  step1: z.infer<typeof PROFILE_SCHEMAS.step1>;
  step3: z.infer<typeof PROFILE_SCHEMAS.step3Seller> | z.infer<typeof PROFILE_SCHEMAS.step3Buyer>;
  step4: z.infer<typeof PROFILE_SCHEMAS.step4Seller> | z.infer<typeof PROFILE_SCHEMAS.step4Buyer>;
};

// ───────────────────────────── Rules ─────────────────────────────

export function requiredDocuments(input: {
  role: OnboardingRole;
  isLegalRepresentative: boolean | null;
  buyerType: BuyerType | null;
}): VerificationDocumentType[] {
  if (input.role === 'SELLER') {
    const docs: VerificationDocumentType[] = ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT'];
    if (input.isLegalRepresentative === false) docs.push('POWER_OF_ATTORNEY');
    return docs;
  }
  switch (input.buyerType) {
    case 'FUND':
    case 'STRATEGIC':
    case 'FAMILY_OFFICE':
      return ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT'];
    case 'ANGEL':
      return ['NATIONAL_ID', 'RUT'];
    default:
      return ['NATIONAL_ID'];
  }
}

export type OnboardingSnapshot = {
  role: OnboardingRole;
  profile: Partial<ProfileData>;
  isLegalRepresentative: boolean | null;
  buyerType: BuyerType | null;
  hasPreferences: boolean;
  documents: { type: VerificationDocumentType; reviewStatus: ReviewStatus }[];
};

const MISSING_REASONS: Record<VerificationDocumentType, string> = {
  NATIONAL_ID: 'Sube tu cédula de ciudadanía para verificar tu identidad.',
  CHAMBER_OF_COMMERCE:
    'Falta el certificado de existencia y representación legal (Cámara de Comercio).',
  RUT: 'Falta el RUT para validar la información tributaria.',
  POWER_OF_ATTORNEY:
    'Como no eres el representante legal, sube el poder o autorización que te permite actuar en nombre de la empresa.',
};

function documentIssue(
  type: VerificationDocumentType,
  documents: OnboardingSnapshot['documents'],
): string | null {
  const ofType = documents.filter((d) => d.type === type);
  if (ofType.some((d) => d.reviewStatus !== 'REJECTED')) return null;
  if (ofType.length > 0) {
    return `El Back Office rechazó tu ${DOCUMENT_LABELS[type]}. Sube una nueva versión.`;
  }
  return MISSING_REASONS[type];
}

export function onboardingProgress(s: OnboardingSnapshot): {
  completedSteps: OnboardingStep[];
  missing: { step: OnboardingStep; reason: string }[];
  canSubmit: boolean;
} {
  const missing: { step: OnboardingStep; reason: string }[] = [];
  const completed: OnboardingStep[] = [];
  const seller = s.role === 'SELLER';

  const step1Ok = PROFILE_SCHEMAS.step1.safeParse(s.profile.step1).success;
  if (step1Ok) completed.push(1);
  else {
    missing.push({
      step: 1,
      reason: seller
        ? 'Completa tu nombre, celular y cargo para identificarte como representante.'
        : 'Completa tu nombre, celular y cargo para crear tu perfil de inversionista.',
    });
  }

  const idIssue = documentIssue('NATIONAL_ID', s.documents);
  if (idIssue === null) completed.push(2);
  else missing.push({ step: 2, reason: idIssue });

  const step3Ok = (seller ? PROFILE_SCHEMAS.step3Seller : PROFILE_SCHEMAS.step3Buyer).safeParse(
    s.profile.step3,
  ).success;
  if (step3Ok) completed.push(3);
  else {
    missing.push({
      step: 3,
      reason: seller
        ? 'Indica si eres el representante legal de la empresa para definir los soportes que necesitas.'
        : 'Indica a quién representas (y los datos de la entidad, si aplica) para definir los soportes que necesitas.',
    });
  }

  const step4Ok =
    (seller
      ? PROFILE_SCHEMAS.step4Seller.safeParse(s.profile.step4).success
      : PROFILE_SCHEMAS.step4Buyer.safeParse(s.profile.step4).success) ||
    (!seller && s.hasPreferences);
  if (step4Ok) completed.push(4);
  else {
    missing.push({
      step: 4,
      reason: seller
        ? 'Completa la información de la empresa (razón social, NIT, sector y ubicación) para validar que existe.'
        : 'Define tus criterios de inversión (sectores, regiones y ticket) para mostrarte oportunidades relevantes.',
    });
  }

  const required = requiredDocuments(s);
  const docIssues = required.map((type) => ({ type, issue: documentIssue(type, s.documents) }));
  if (docIssues.every((d) => d.issue === null)) completed.push(5);
  for (const { type, issue } of docIssues) {
    // The national ID is already reported under step 2.
    if (issue !== null && type !== 'NATIONAL_ID') missing.push({ step: 5, reason: issue });
  }

  return {
    completedSteps: completed,
    missing,
    canSubmit: [1, 2, 3, 4, 5].every((n) => completed.includes(n as OnboardingStep)),
  };
}
