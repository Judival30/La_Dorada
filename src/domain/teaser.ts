/**
 * Teaser serializer (spec §6, R2(b)): the ONLY code that decides what a buyer
 * sees before signing an NDA. Pure and fail-closed:
 *
 * - a section appears only if its visibility row has `inTeaser = true` and the
 *   section is teaser-allowed (missing row = hidden);
 * - legal name, NIT, city and address never appear: they are not copied, and
 *   every seller-typed text is scrubbed of them (the seller may type the
 *   company name in the description);
 * - figures appear only as ranges (revenue bucket, deal size range, CAGR %),
 *   and money amounts typed in free text are removed;
 * - the output is plain JSON (no bigint), safe to send to the client.
 */
import { formatCOP } from './money';
import {
  DEAL_SIZE_RANGES,
  OPPORTUNITY_TYPE_LABELS,
  dealSizeRangeOf,
  type OpportunityType,
} from './opportunity';
import { SECTOR_LABELS, type Sector } from './sectors';
import { VALUATION_DISCLAIMER, cagr } from './valuation';
import {
  INFO_SECTION_META,
  TEASER_SECTIONS,
  type InfoSection,
  type TeaserSectionKey,
} from './visibility';

export type TeaserSource = {
  id: string;
  title: string;
  type: OpportunityType;
  objective: string;
  /** Accepted for completeness; never part of the teaser. */
  idealBuyerProfile: string | null;
  dealSizeMin: bigint | null;
  dealSizeMax: bigint | null;
  horizon: string | null;
  sector: Sector;
  subsector: string | null;
  department: string;
  /** Identity: used only to scrub free text. */
  city: string;
  /** Identity: used only to scrub free text. */
  legalName: string;
  /** Identity: used only to scrub free text. */
  nit: string;
  description: string;
  employeesRange: string | null;
  foundedYear: number | null;
  channels?: string[];
  capacity?: string | null;
  /** Pesos. */
  financials: { year: number; revenue: bigint }[];
  visibility: { section: InfoSection; inTeaser: boolean }[];
  teaserImageUrl: string | null;
  evaluation: { valuationLow: bigint; valuationHigh: bigint; score: number } | null;
};

export type TeaserField = { label: string; value: string };
export type TeaserSection = { title: string; text: string | null; fields: TeaserField[] };

export type Teaser = {
  id: string;
  title: string;
  type: OpportunityType;
  typeLabel: string;
  sector: Sector;
  sectorLabel: string;
  department: string;
  teaserImageUrl: string | null;
  sections: Partial<Record<TeaserSectionKey, TeaserSection>>;
  evaluation: {
    valuationLow: string;
    valuationHigh: string;
    score: number;
    disclaimer: string;
  } | null;
};

// ───────────────────────────── Scrub ──────────────────────────────

export type CompanyIdentity = { legalName: string; nit: string; city: string };

const COMPANY_PLACEHOLDER = 'la empresa';
const CITY_PLACEHOLDER = 'la región';
const AMOUNT_PLACEHOLDER = 'cifra reservada';

const ACCENT_VARIANTS: Record<string, string> = {
  a: 'aáàäâã',
  e: 'eéèëê',
  i: 'iíìïî',
  o: 'oóòöôõ',
  u: 'uúùüû',
  n: 'nñ',
  c: 'cç',
};

/** Accent- and space-tolerant pattern for a literal (used with the `iu` flags). */
function loosePattern(literal: string): string {
  let out = '';
  for (const ch of literal.trim()) {
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const variants = ACCENT_VARIANTS[base];
    if (variants) out += `[${variants}]`;
    else if (/\s/.test(ch)) out += '\\s+';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return out.replace(/(\\s\+)+/g, '\\s+');
}

/** Whole-word match: not preceded/followed by a letter or digit. */
const word = (pattern: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'giu');

/** "Cafés de Antioquia S.A.S." → "Cafés de Antioquia". */
const CORPORATE_SUFFIX =
  /[\s,]+(?:s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|limitada|e\.?\s?u\.?|s\.?\s?en\s?c\.?(?:\s?s\.?)?|[&y]\s+c[ií]a\.?)$/iu;

const MIN_NAME_LENGTH = 3;
const MIN_CORE_NAME_LENGTH = 4;

const MONEY = word(
  '(?:COP|USD|US\\$|\\$)\\s?\\d[\\d.,]*(?:\\s?(?:mil\\s+millones|millones|mill[oó]n|MM|M))?',
);

/**
 * Removes the company identity from seller-typed text: legal name (with and
 * without corporate suffix) → "la empresa", city → "la región", NIT (any
 * spelling, with its "NIT" label) → removed, money amounts → "cifra reservada".
 * Matching ignores case and accents and respects word boundaries.
 */
export function scrubIdentity(text: string, id: CompanyIdentity): string {
  let out = text;

  const nitDigits = id.nit.replace(/\D/g, '').slice(0, 9);
  if (nitDigits.length >= 6) {
    const digits = nitDigits.split('').join('[.\\s-]?');
    const nit = new RegExp(
      `(?:\\bNIT\\b\\.?\\s*(?:No\\.?|N\\.?º|#)?\\s*:?\\s*)?(?<!\\d)${digits}(?:\\s*-?\\s*\\d)?(?!\\d)`,
      'giu',
    );
    out = out.replace(nit, '');
  }

  const legal = id.legalName.trim();
  const core = legal.replace(CORPORATE_SUFFIX, '').trim();
  const names = [legal, core]
    .filter((n, i) => n.length >= (i === 0 ? MIN_NAME_LENGTH : MIN_CORE_NAME_LENGTH))
    .sort((a, b) => b.length - a.length);
  for (const name of names) out = out.replace(word(loosePattern(name)), COMPANY_PLACEHOLDER);

  if (id.city.trim().length >= MIN_NAME_LENGTH) {
    out = out.replace(word(loosePattern(id.city)), CITY_PLACEHOLDER);
  }

  out = out.replace(MONEY, AMOUNT_PLACEHOLDER);

  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}

// ──────────────────────────── Buckets ─────────────────────────────

const REVENUE_BUCKETS: { below: bigint | null; label: string }[] = [
  { below: 5_000_000_000n, label: 'Menos de COP 5.000 M' },
  { below: 20_000_000_000n, label: 'COP 5.000 M – 20.000 M' },
  { below: 50_000_000_000n, label: 'COP 20.000 M – 50.000 M' },
  { below: null, label: 'Más de COP 50.000 M' },
];

/** Last-year revenue (pesos) → range label. Never the exact figure. */
export function revenueBucket(revenue: bigint): string {
  return REVENUE_BUCKETS.find((b) => b.below === null || revenue < b.below)!.label;
}

/** Coarse company age, so the founding year cannot be inferred. */
function ageLabel(foundedYear: number, now: Date): string {
  const years = now.getFullYear() - foundedYear;
  if (years <= 5) return 'Hasta 5 años';
  return `Más de ${Math.floor((years - 1) / 5) * 5} años`;
}

function growthLabel(financials: TeaserSource['financials']): string | null {
  if (financials.length < 2) return null;
  const sorted = [...financials].sort((a, b) => a.year - b.year);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (first.revenue <= 0n) return null;
  const pct = Math.round(cagr(first.revenue, last.revenue, last.year - first.year) * 100);
  return `${pct > 0 ? '+' : ''}${pct === 0 ? 0 : pct} %`;
}

// ──────────────────────────── Serializer ──────────────────────────

const field = (label: string, value: string | null | undefined): TeaserField[] =>
  value ? [{ label, value }] : [];

const section = (
  key: TeaserSectionKey,
  text: string | null,
  fields: TeaserField[],
): TeaserSection | null =>
  text || fields.length > 0
    ? { title: INFO_SECTION_META[key].label, text: text || null, fields }
    : null;

/** Builds the anonymous teaser. Pure; `now` only affects the company age label. */
export function toTeaser(input: TeaserSource, now: Date = new Date()): Teaser {
  const id: CompanyIdentity = { legalName: input.legalName, nit: input.nit, city: input.city };
  const clean = (v: string | null | undefined) => (v ? scrubIdentity(v, id) || null : null);

  const typeLabel = OPPORTUNITY_TYPE_LABELS[input.type].label;
  const employees = input.employeesRange ? `${clean(input.employeesRange)} empleados` : null;
  const dealRange = dealSizeRangeOf(input.dealSizeMin, input.dealSizeMax);
  const lastYear = [...input.financials].sort((a, b) => b.year - a.year)[0];
  const channels = (input.channels ?? []).map(clean).filter(Boolean).join(', ');

  const build: Record<TeaserSectionKey, () => TeaserSection | null> = {
    SUMMARY: () =>
      section('SUMMARY', clean(input.objective), [
        ...field('Modalidad', typeLabel),
        ...field(
          'Tamaño de la transacción',
          DEAL_SIZE_RANGES.find((r) => r.key === dealRange)?.label,
        ),
        ...field('Horizonte', clean(input.horizon)),
      ]),
    BUSINESS: () =>
      section('BUSINESS', clean(input.description), [
        ...field('Subsector', clean(input.subsector)),
        ...field('Tamaño de la empresa', employees),
        ...field('Trayectoria', input.foundedYear ? ageLabel(input.foundedYear, now) : null),
      ]),
    REVENUE: () =>
      section('REVENUE', null, [
        ...field('Ingresos del último año', lastYear ? revenueBucket(lastYear.revenue) : null),
        ...field('Crecimiento anual compuesto', growthLabel(input.financials)),
      ]),
    OPERATIONS: () =>
      section('OPERATIONS', null, [
        ...field('Tamaño del equipo', employees),
        ...field('Canales de venta', channels),
        ...field('Capacidad', clean(input.capacity)),
      ]),
  };

  const visible = new Set(input.visibility.filter((v) => v.inTeaser).map((v) => v.section));
  const sections: Teaser['sections'] = {};
  for (const key of TEASER_SECTIONS) {
    if (!visible.has(key)) continue;
    const built = build[key]();
    if (built) sections[key] = built;
  }

  return {
    id: input.id,
    title: clean(input.title) ?? '',
    type: input.type,
    typeLabel,
    sector: input.sector,
    sectorLabel: SECTOR_LABELS[input.sector],
    department: input.department,
    teaserImageUrl: input.teaserImageUrl,
    sections,
    evaluation: input.evaluation
      ? {
          valuationLow: formatCOP(input.evaluation.valuationLow),
          valuationHigh: formatCOP(input.evaluation.valuationHigh),
          score: input.evaluation.score,
          disclaimer: VALUATION_DISCLAIMER,
        }
      : null,
  };
}
