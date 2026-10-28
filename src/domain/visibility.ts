/**
 * Public (teaser) vs. confidential (data room) information sections, slide10.
 * The teaser itself is built only by `toTeaser()` in ./teaser.
 */

// Mirror of the Prisma `InfoSection` enum (pinned by src/server/db/enums.test.ts).
export const INFO_SECTIONS = [
  'SUMMARY',
  'BUSINESS',
  'REVENUE',
  'FINANCIAL_STATEMENTS',
  'CONTRACTS',
  'CAPEX',
  'LITIGATION',
  'SHAREHOLDERS',
  'OPERATIONS',
  'PROJECTIONS',
] as const;
export type InfoSection = (typeof INFO_SECTIONS)[number];

export const INFO_SECTION_META: Record<
  InfoSection,
  { label: string; description: string; teaserAllowed: boolean; defaultTeaser: boolean }
> = {
  SUMMARY: {
    label: 'Resumen ejecutivo',
    description: 'Visión general de la empresa, principales hitos y propuesta de valor.',
    teaserAllowed: true,
    defaultTeaser: true,
  },
  BUSINESS: {
    label: 'Descripción del negocio',
    description: 'Modelo de negocio, productos y servicios, mercado objetivo.',
    teaserAllowed: true,
    defaultTeaser: true,
  },
  REVENUE: {
    label: 'Cifras de ingresos',
    description: 'Ingresos históricos y crecimiento. En el teaser solo se muestran como rango.',
    teaserAllowed: true,
    defaultTeaser: true,
  },
  FINANCIAL_STATEMENTS: {
    label: 'Estados financieros',
    description: 'Estados financieros auditados (últimos años).',
    teaserAllowed: false,
    defaultTeaser: false,
  },
  CONTRACTS: {
    label: 'Contratos con clientes',
    description: 'Listado de principales clientes y contratos vigentes.',
    teaserAllowed: false,
    defaultTeaser: false,
  },
  CAPEX: {
    label: 'Plan de inversiones (CAPEX)',
    description: 'Inversiones planeadas y en ejecución.',
    teaserAllowed: false,
    defaultTeaser: false,
  },
  LITIGATION: {
    label: 'Litigios y contingencias',
    description: 'Procesos legales y contingencias relevantes.',
    teaserAllowed: false,
    defaultTeaser: false,
  },
  SHAREHOLDERS: {
    label: 'Estructura accionaria',
    description: 'Participación accionaria y pactos de accionistas.',
    teaserAllowed: false,
    defaultTeaser: false,
  },
  OPERATIONS: {
    label: 'Información operativa',
    description: 'Capacidad instalada, plantas, proveedores clave.',
    teaserAllowed: true,
    defaultTeaser: true,
  },
  PROJECTIONS: {
    label: 'Proyecciones financieras',
    description: 'Proyecciones a 3-5 años.',
    teaserAllowed: false,
    defaultTeaser: false,
  },
};

/** Sections that may appear in a teaser, in display order. */
export const TEASER_SECTIONS = INFO_SECTIONS.filter((s) => INFO_SECTION_META[s].teaserAllowed) as (
  'SUMMARY' | 'BUSINESS' | 'REVENUE' | 'OPERATIONS'
)[];
export type TeaserSectionKey = (typeof TEASER_SECTIONS)[number];

export type VisibilityRow = { section: InfoSection; inTeaser: boolean; inDataRoom: boolean };

/** One row per section: everything in the data room, teaser per slide10. */
export function defaultVisibility(): VisibilityRow[] {
  return INFO_SECTIONS.map((section) => ({
    section,
    inTeaser: INFO_SECTION_META[section].defaultTeaser,
    inDataRoom: true,
  }));
}

/** Problems with a teaser configuration (es-CO); empty = valid. */
export function teaserVisibilityIssues(
  rows: readonly { section: InfoSection; inTeaser: boolean }[],
): string[] {
  const issues: string[] = [];
  if (!rows.some((r) => r.inTeaser && INFO_SECTION_META[r.section].teaserAllowed)) {
    issues.push(
      'Elige al menos una sección para el teaser; sin ella los compradores no verán nada de la oportunidad.',
    );
  }
  const forbidden = rows
    .filter((r) => r.inTeaser && !INFO_SECTION_META[r.section].teaserAllowed)
    .map((r) => INFO_SECTION_META[r.section].label);
  if (forbidden.length > 0) {
    issues.push(
      `Estas secciones son confidenciales y solo pueden ir en el data room: ${forbidden.join(', ')}.`,
    );
  }
  return issues;
}
