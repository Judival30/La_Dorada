/**
 * Opportunity rules (pure domain, no Prisma at runtime): slide09 catalogs,
 * the definition schema, codenames and the "ready to submit" checklist.
 */
import { z } from 'zod';
import { financialYearsIssue } from './company';
import { millions } from './money';
import type { Sector } from './sectors';
import { teaserVisibilityIssues, type InfoSection } from './visibility';

// Mirror of the Prisma `OpportunityType` enum (pinned by src/server/db/enums.test.ts).
export const OPPORTUNITY_TYPES = [
  'VENTA_TOTAL',
  'VENTA_PARCIAL',
  'LEVANTAMIENTO_CAPITAL',
  'SOCIO_ESTRATEGICO',
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** slide09 "Selecciona la modalidad de la oportunidad". */
export const OPPORTUNITY_TYPE_LABELS: Record<
  OpportunityType,
  { label: string; description: string }
> = {
  VENTA_TOTAL: { label: 'Venta total', description: 'Vendo el 100% de la empresa.' },
  VENTA_PARCIAL: { label: 'Venta parcial', description: 'Vendo un porcentaje de la empresa.' },
  LEVANTAMIENTO_CAPITAL: {
    label: 'Levantamiento de capital',
    description: 'Busco inversión para impulsar el crecimiento.',
  },
  SOCIO_ESTRATEGICO: {
    label: 'Socio estratégico',
    description: 'Busco un socio que aporte capacidades y valor estratégico.',
  },
};

/** slide09 "Objetivo principal". */
export const OBJECTIVES = [
  'Liquidez para los socios',
  'Financiar la expansión',
  'Sucesión o relevo generacional',
  'Retiro de los fundadores',
  'Sumar capacidades de un socio estratégico',
  'Internacionalización',
  'Reestructurar la deuda',
  'Profesionalizar la gestión',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

/** slide09 "Horizonte de tiempo". */
export const HORIZONS = [
  'Menos de 6 meses',
  '6 a 12 meses',
  '12 a 24 meses',
  'Más de 24 meses',
] as const;
export type Horizon = (typeof HORIZONS)[number];

/** slide09 "Tamaño de la transacción / participación", in millions of COP. */
export const DEAL_SIZE_RANGES = [
  { key: 'UNDER_5K', label: 'Hasta COP 5.000 M', minMillions: 0, maxMillions: 5000 },
  { key: '5K_20K', label: 'COP 5.000 M – 20.000 M', minMillions: 5000, maxMillions: 20000 },
  { key: '20K_50K', label: 'COP 20.000 M – 50.000 M', minMillions: 20000, maxMillions: 50000 },
  { key: 'OVER_50K', label: 'Más de COP 50.000 M', minMillions: 50000, maxMillions: null },
] as const;
export type DealSizeRange = (typeof DEAL_SIZE_RANGES)[number]['key'];
const DEAL_SIZE_KEYS = DEAL_SIZE_RANGES.map((r) => r.key) as [DealSizeRange, ...DealSizeRange[]];

/** Range key → stored bounds in pesos (`max` null = open-ended). */
export function dealSizeBounds(key: DealSizeRange): { min: bigint; max: bigint | null } {
  const r = DEAL_SIZE_RANGES.find((x) => x.key === key)!;
  return {
    min: millions(r.minMillions),
    max: r.maxMillions === null ? null : millions(r.maxMillions),
  };
}

/**
 * Stored bounds → range key: the exact range if the bounds match one,
 * otherwise the range containing the midpoint (or the only known bound).
 * Never exposes the bounds themselves.
 */
export function dealSizeRangeOf(min: bigint | null, max: bigint | null): DealSizeRange | null {
  if (min === null && max === null) return null;
  for (const r of DEAL_SIZE_RANGES) {
    const b = dealSizeBounds(r.key);
    if (b.min === min && b.max === max) return r.key;
  }
  const lo = min ?? 0n;
  const point = max === null ? lo : (lo + max) / 2n;
  const hit = DEAL_SIZE_RANGES.find((r) => {
    const b = dealSizeBounds(r.key);
    return point >= b.min && (b.max === null || point < b.max);
  });
  return hit!.key;
}

const NIT_LIKE = /\d(?:[.\s-]?\d){4,}/;

export const OPPORTUNITY_SCHEMA = z.object({
  type: z.enum(OPPORTUNITY_TYPES, { error: 'Selecciona la modalidad de la oportunidad' }),
  objective: z.enum(OBJECTIVES, { error: 'Selecciona un objetivo de la lista' }),
  dealSizeRange: z.enum(DEAL_SIZE_KEYS, { error: 'Selecciona un rango de la lista' }),
  horizon: z.enum(HORIZONS, { error: 'Selecciona un horizonte de la lista' }),
  idealBuyerProfile: z
    .string()
    .trim()
    .min(20, 'Describe el perfil ideal con al menos 20 caracteres')
    .max(500, 'El perfil ideal admite máximo 500 caracteres'),
  /** Public codename (anonymous): never the legal name or NIT. */
  title: z
    .string()
    .trim()
    .min(3, 'El nombre clave debe tener al menos 3 caracteres')
    .max(60, 'El nombre clave admite máximo 60 caracteres')
    .refine(
      (t) => !NIT_LIKE.test(t),
      'El nombre clave no puede incluir el NIT ni otros números de identificación.',
    ),
});
export type OpportunityDefinition = z.infer<typeof OPPORTUNITY_SCHEMA>;

// ─────────────────────────── Codenames ────────────────────────────

/** 40 words from Colombian nature, for anonymous codenames. */
// prettier-ignore
export const CODENAME_WORDS = [
  'Cóndor', 'Ceiba', 'Guadua', 'Colibrí', 'Frailejón', 'Orquídea', 'Jaguar', 'Tucán',
  'Guacamaya', 'Palma de Cera', 'Manglar', 'Páramo', 'Arrayán', 'Yarumo', 'Samán', 'Guayacán',
  'Turpial', 'Danta', 'Chigüiro', 'Morpho', 'Barranquero', 'Toche', 'Tángara', 'Caimán',
  'Manatí', 'Nevado', 'Cascada', 'Sierra', 'Laguna', 'Cafeto', 'Cacao', 'Heliconia',
  'Abarco', 'Nogal', 'Roble', 'Garza', 'Gavilán', 'Ocelote', 'Tití', 'Halcón',
] as const;

/** FNV-1a 32-bit over UTF-16 code units. */
function fnv1a(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 'Proyecto <word>' for a seed (e.g. the opportunity id). */
export function generateCodename(seed: string): string {
  return `Proyecto ${CODENAME_WORDS[fnv1a(seed) % CODENAME_WORDS.length]}`;
}

// ─────────────────────────── Readiness ────────────────────────────

export type OpportunitySnapshot = {
  company: {
    description: string | null;
    sector: Sector | null;
    subsector: string | null;
    foundedYear: number | null;
    employeesRange: string | null;
    department: string | null;
    city: string | null;
  } | null;
  financialYears: { year: number }[];
  folders: { name: string; required: boolean; documentCount: number }[];
  opportunity: {
    title: string | null;
    type: OpportunityType | null;
    objective: string | null;
    dealSizeMin: bigint | null;
    dealSizeMax: bigint | null;
    horizon: string | null;
    idealBuyerProfile: string | null;
  };
  visibility: { section: InfoSection; inTeaser: boolean }[];
  hasTeaserImage: boolean;
};

export type ReadinessArea =
  'company' | 'financials' | 'documents' | 'opportunity' | 'visibility' | 'teaser';

const filled = (v: string | number | bigint | null | undefined) =>
  v !== null && v !== undefined && (typeof v !== 'string' || v.trim() !== '');

const missingLabels = (checks: [string, unknown][]) =>
  checks
    .filter(([, v]) => !filled(v as string | number | bigint | null | undefined))
    .map(([label]) => label);

/** What is still missing before the seller can submit the opportunity, and why (es-CO). */
export function opportunityReadiness(
  s: OpportunitySnapshot,
  now: Date = new Date(),
): { complete: boolean; missing: { area: ReadinessArea; reason: string }[] } {
  const missing: { area: ReadinessArea; reason: string }[] = [];

  const c = s.company;
  const companyGaps = c
    ? missingLabels([
        ['descripción', c.description],
        ['sector', c.sector],
        ['subsector', c.subsector],
        ['año de fundación', c.foundedYear],
        ['tamaño', c.employeesRange],
        ['departamento', c.department],
        ['ciudad', c.city],
      ])
    : [];
  if (!c) {
    missing.push({
      area: 'company',
      reason:
        'Registra la información de la empresa (descripción, sector, tamaño y ubicación) para que los compradores entiendan el negocio.',
    });
  } else if (companyGaps.length > 0) {
    missing.push({
      area: 'company',
      reason: `Completa en la empresa: ${companyGaps.join(', ')}. Los compradores lo necesitan para entender el negocio.`,
    });
  }

  const financials = financialYearsIssue(s.financialYears, now);
  if (financials) missing.push({ area: 'financials', reason: financials });

  if (s.folders.length === 0) {
    missing.push({
      area: 'documents',
      reason:
        'El data room aún no tiene carpetas. Sube los documentos de soporte para que el Back Office pueda evaluar la empresa.',
    });
  } else {
    const empty = s.folders.filter((f) => f.required && f.documentCount === 0).map((f) => f.name);
    if (empty.length > 0) {
      missing.push({
        area: 'documents',
        reason: `Faltan documentos en las carpetas requeridas: ${empty.join(', ')}. El Back Office los necesita para evaluar la empresa.`,
      });
    }
  }

  const o = s.opportunity;
  const opportunityGaps = missingLabels([
    ['nombre clave', o.title],
    ['modalidad', o.type],
    ['objetivo', o.objective],
    ['tamaño de la transacción', o.dealSizeMin ?? o.dealSizeMax],
    ['horizonte', o.horizon],
    ['perfil del comprador ideal', o.idealBuyerProfile],
  ]);
  if (opportunityGaps.length > 0) {
    missing.push({
      area: 'opportunity',
      reason: `Define la oportunidad: falta ${opportunityGaps.join(', ')}. Así la mostramos a compradores compatibles.`,
    });
  }

  for (const reason of teaserVisibilityIssues(s.visibility)) {
    missing.push({ area: 'visibility', reason });
  }

  if (!s.hasTeaserImage) {
    missing.push({
      area: 'teaser',
      reason:
        'Falta la imagen principal del teaser; es lo primero que ven los compradores en el marketplace.',
    });
  }

  return { complete: missing.length === 0, missing };
}
