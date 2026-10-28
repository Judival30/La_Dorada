/**
 * Company rules (pure domain, no Prisma at runtime): NIT check digit, the
 * slide08 company form schemas and the financial-years rule (3–5 consecutive
 * years ending last year or this year). Amounts in forms are in millions of COP.
 */
import { z } from 'zod';
import { DEPARTMENTS } from './onboarding';
import { SECTORS } from './sectors';

// ─────────────────────────────── NIT ───────────────────────────────

/** DIAN weights, applied to the base digits from right to left. */
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71] as const;

const NIT_FORMAT = /^\d{3}\.\d{3}\.\d{3}-\d$/;

/**
 * DIAN check digit ("dígito de verificación") of a NIT base.
 * Σ digit·weight (right to left) mod 11 = r; dv = r < 2 ? r : 11 − r.
 * Dots and spaces in `base` are ignored; the base must have 1–15 digits.
 */
export function nitCheckDigit(base: string): number {
  const digits = base.replace(/[.\s]/g, '');
  if (!/^\d{1,15}$/.test(digits)) {
    throw new RangeError(`nitCheckDigit() requires 1–15 digits, got "${base}"`);
  }
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[digits.length - 1 - i]);
    sum += digit * NIT_WEIGHTS[i]!;
  }
  const r = sum % 11;
  return r < 2 ? r : 11 - r;
}

/** `900.123.456-8`: the expected format and a matching DIAN check digit. */
export function isValidNit(nit: string): boolean {
  const value = nit.trim();
  if (!NIT_FORMAT.test(value)) return false;
  const [base, dv] = value.split('-') as [string, string];
  return nitCheckDigit(base) === Number(dv);
}

/** '900123456' → '900.123.456-8' (computed check digit). */
export function formatNit(base9: string): string {
  if (!/^\d{9}$/.test(base9)) {
    throw new RangeError(`formatNit() requires exactly 9 digits, got "${base9}"`);
  }
  return `${base9.slice(0, 3)}.${base9.slice(3, 6)}.${base9.slice(6)}-${nitCheckDigit(base9)}`;
}

/** NIT for new input (format + check digit). Seed data may predate this rule. */
export const NIT_SCHEMA = z
  .string()
  .trim()
  .regex(NIT_FORMAT, 'NIT inválido. Usa el formato 900.123.456-7')
  .refine(isValidNit, 'El dígito de verificación del NIT no coincide. Revísalo en el RUT.');

// ───────────────────────────── Company ─────────────────────────────

/** Company size ranges (slide08 "Tamaño de la empresa"); same strings as the seed. */
export const EMPLOYEE_RANGES = [
  '1 - 10',
  '11 - 50',
  '51 - 200',
  '201 - 500',
  'Más de 500',
] as const;
export type EmployeesRange = (typeof EMPLOYEE_RANGES)[number];

const currentYear = () => new Date().getFullYear();

const text = (min: number, max: number, field: string) =>
  z
    .string()
    .trim()
    .min(min, `${field}: escribe al menos ${min} caracteres`)
    .max(max, `${field}: máximo ${max} caracteres`);

const uniqueList = (item: z.ZodString, max: number, field: string) =>
  z
    .array(item)
    .max(max, `${field}: máximo ${max}`)
    .refine(
      (list) => new Set(list.map((v) => v.toLocaleLowerCase('es-CO'))).size === list.length,
      `${field}: hay valores repetidos`,
    );

export const COMPANY_SCHEMAS = {
  general: z.object({
    /** Trade name. Never shown in the teaser (the codename is). */
    name: text(2, 120, 'Nombre de la empresa'),
    description: text(40, 600, 'Descripción'),
    foundedYear: z.coerce
      .number()
      .int('Año de fundación inválido')
      .min(1900, 'El año de fundación debe ser 1900 o posterior')
      .refine((y) => y <= currentYear(), 'El año de fundación no puede ser futuro'),
    employeesRange: z.enum(EMPLOYEE_RANGES, { error: 'Selecciona un tamaño de la lista' }),
  }),
  sector: z.object({
    sector: z.enum(SECTORS, { error: 'Selecciona un sector de la lista' }),
    subsector: text(2, 80, 'Subsector'),
    tags: uniqueList(text(2, 30, 'Etiqueta'), 5, 'Etiquetas').default([]),
  }),
  operations: z.object({
    channels: uniqueList(text(2, 60, 'Canal de venta'), 8, 'Canales de venta'),
    capacity: text(2, 120, 'Capacidad').optional(),
  }),
  location: z.object({
    department: z.enum(DEPARTMENTS, { error: 'Selecciona un departamento de la lista' }),
    city: text(2, 80, 'Ciudad'),
    /** Only for the data room; never in the teaser. */
    address: text(5, 160, 'Dirección').optional(),
  }),
} as const;

// ─────────────────────────── Financials ────────────────────────────

export const MIN_FINANCIAL_YEARS = 3;
export const MAX_FINANCIAL_YEARS = 5;

const MISSING_FINANCIALS =
  'Faltan los estados financieros de al menos 3 años consecutivos para estimar la valoración.';

/**
 * Why a series of financial years is not usable, or null if it is:
 * 3–5 distinct consecutive years whose last one is last year or this year.
 */
export function financialYearsIssue(
  years: readonly { year: number }[],
  now: Date = new Date(),
): string | null {
  if (years.length < MIN_FINANCIAL_YEARS) return MISSING_FINANCIALS;
  if (years.length > MAX_FINANCIAL_YEARS) {
    return `Registra como máximo ${MAX_FINANCIAL_YEARS} años de estados financieros.`;
  }
  const sorted = years.map((y) => y.year).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1]! + 1) {
      return 'Los años de los estados financieros deben ser consecutivos y sin repetirse.';
    }
  }
  const last = sorted[sorted.length - 1]!;
  const thisYear = now.getFullYear();
  if (last !== thisYear && last !== thisYear - 1) {
    return `El último año registrado debe ser ${thisYear - 1} o ${thisYear} para que la valoración esté vigente.`;
  }
  return null;
}

/** Up to COP 10 billones (10.000.000 M), far above any listed company. */
const MAX_MILLIONS = 10_000_000;

const millionsInt = (field: string) =>
  z.coerce
    .number()
    .int(`${field}: usa un número entero de millones`)
    .min(-MAX_MILLIONS, `${field}: valor fuera de rango`)
    .max(MAX_MILLIONS, `${field}: valor fuera de rango`);

export const FINANCIAL_YEAR_SCHEMA = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  /** Millions of COP. */
  revenue: millionsInt('Ingresos').min(0, 'Ingresos: no pueden ser negativos'),
  ebitda: millionsInt('EBITDA'),
  netIncome: millionsInt('Utilidad neta'),
});
export type FinancialYearInput = z.infer<typeof FINANCIAL_YEAR_SCHEMA>;

/** 3–5 consecutive years (millions of COP), returned sorted by year. */
export const FINANCIAL_YEARS_SCHEMA = z
  .array(FINANCIAL_YEAR_SCHEMA)
  .superRefine((years, ctx) => {
    const issue = financialYearsIssue(years);
    if (issue) ctx.addIssue({ code: 'custom', message: issue });
  })
  .transform((years) => [...years].sort((a, b) => a.year - b.year));
