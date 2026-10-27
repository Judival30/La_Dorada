import type { Sector } from '@/domain/sectors';

export type SectorMultiples = {
  ebitdaLow: number;
  ebitdaHigh: number;
  revenueLow: number;
  revenueHigh: number;
};

/** Orientative sector multiples (EV/EBITDA and EV/Revenue). */
export const DEFAULT_SECTOR_MULTIPLES: Record<Sector, SectorMultiples> = {
  AGROINDUSTRIA: { ebitdaLow: 5, ebitdaHigh: 7, revenueLow: 0.8, revenueHigh: 1.5 },
  ALIMENTOS_BEBIDAS: { ebitdaLow: 6, ebitdaHigh: 9, revenueLow: 1, revenueHigh: 2 },
  LOGISTICA: { ebitdaLow: 5, ebitdaHigh: 7.5, revenueLow: 0.6, revenueHigh: 1.2 },
  SERVICIOS_FINANCIEROS: { ebitdaLow: 8, ebitdaHigh: 12, revenueLow: 2, revenueHigh: 4 },
  MANUFACTURA: { ebitdaLow: 4.5, ebitdaHigh: 6.5, revenueLow: 0.5, revenueHigh: 1 },
  TECNOLOGIA: { ebitdaLow: 8, ebitdaHigh: 14, revenueLow: 2, revenueHigh: 5 },
  SALUD: { ebitdaLow: 7, ebitdaHigh: 10, revenueLow: 1, revenueHigh: 2.5 },
  RETAIL: { ebitdaLow: 5, ebitdaHigh: 8, revenueLow: 0.3, revenueHigh: 0.8 },
  CONSTRUCCION: { ebitdaLow: 4, ebitdaHigh: 6, revenueLow: 0.4, revenueHigh: 0.9 },
  ENERGIA: { ebitdaLow: 6, ebitdaHigh: 9, revenueLow: 1, revenueHigh: 2.5 },
};

export const VALUATION_DISCLAIMER =
  'Orientativo. No es asesoría financiera regulada ni obliga a comprar o vender.';

/** Compound annual growth rate: (last/first)^(1/years) − 1. Returns −1 if last <= 0. */
export function cagr(first: bigint, last: bigint, years: number): number {
  if (!(years > 0)) throw new RangeError(`cagr() requires years > 0, got ${years}`);
  if (first <= 0n) throw new RangeError(`cagr() requires first > 0, got ${first}`);
  if (last <= 0n) return -1;
  return (Number(last) / Number(first)) ** (1 / years) - 1;
}

const SCALE = 1000n;
const ROUND_UNIT = 100_000_000n; // COP 100 M in pesos

function scaled(x: number): bigint {
  return BigInt(Math.round(x * 1000));
}

/** amount × multiple × factor (both scaled by 1000), rounded to COP 100 M. amount must be > 0. */
function endpoint(amount: bigint, multiple: bigint, factor: bigint): bigint {
  const divisor = SCALE * SCALE * ROUND_UNIT;
  return ((amount * multiple * factor + divisor / 2n) / divisor) * ROUND_UNIT;
}

/**
 * Deterministic orientative valuation range.
 *
 * - basis = EBITDA if ebitda > 0: [ebitda × ebitdaLow, ebitda × ebitdaHigh];
 *   otherwise REVENUE: [revenue × revenueLow, revenue × revenueHigh]
 *   (if revenue <= 0 too, the range is [0, 0]).
 * - growth factor = 1.10 if cagr3y > 0.15, 0.90 if cagr3y < 0, else 1.
 * - each endpoint is rounded to the nearest COP 100 M (half away from zero).
 *
 * Exact bigint arithmetic: multiples and factor are scaled by 1000.
 */
export function valuationRange(
  input: { revenue: bigint; ebitda: bigint; cagr3y: number },
  m: SectorMultiples,
): { low: bigint; high: bigint; basis: 'EBITDA' | 'REVENUE' } {
  const factor = input.cagr3y > 0.15 ? 1100n : input.cagr3y < 0 ? 900n : 1000n;
  if (input.ebitda > 0n) {
    return {
      low: endpoint(input.ebitda, scaled(m.ebitdaLow), factor),
      high: endpoint(input.ebitda, scaled(m.ebitdaHigh), factor),
      basis: 'EBITDA',
    };
  }
  if (input.revenue <= 0n) return { low: 0n, high: 0n, basis: 'REVENUE' };
  return {
    low: endpoint(input.revenue, scaled(m.revenueLow), factor),
    high: endpoint(input.revenue, scaled(m.revenueHigh), factor),
    basis: 'REVENUE',
  };
}

export type MatrixStatus = 'APPROVED' | 'TO_CLARIFY' | 'RISK';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'TO_CLARIFY';

export type ScoreInput = {
  docsDelivered: number;
  docsRequired: number;
  financialConsistency: MatrixStatus;
  cagr3y: number;
  ebitdaMargin: number;
  customerDependency: RiskLevel;
  legalContingencies: RiskLevel;
};

export type ScoreWeights = {
  infoQuality: number;
  consistency: number;
  growth: number;
  margin: number;
  risks: number;
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  infoQuality: 0.3,
  consistency: 0.25,
  growth: 0.15,
  margin: 0.15,
  risks: 0.15,
};

const CONSISTENCY_POINTS: Record<MatrixStatus, number> = {
  APPROVED: 100,
  TO_CLARIFY: 50,
  RISK: 25,
};

const RISK_POINTS: Record<RiskLevel, number> = {
  LOW: 100,
  MEDIUM: 60,
  HIGH: 20,
  TO_CLARIFY: 40,
};

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/**
 * Deterministic 0–100 score.
 *
 * - infoQuality = clamp(100 · delivered / required, 0, 100); 0 if required = 0.
 * - consistency: APPROVED 100, TO_CLARIFY 50, RISK 25.
 * - growth = 100 · (clamp(cagr3y, −0.10, 0.30) + 0.10) / 0.40.
 * - margin = 100 · clamp(ebitdaMargin, 0, 0.30) / 0.30.
 * - risks = mean of customerDependency and legalContingencies
 *   (LOW 100, MEDIUM 60, HIGH 20, TO_CLARIFY 40).
 * - total = Math.round(Σ weight · component). Breakdown values are unrounded.
 */
export function computeScore(
  input: ScoreInput,
  w: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): { total: number; breakdown: Record<keyof ScoreWeights, number> } {
  const breakdown: Record<keyof ScoreWeights, number> = {
    infoQuality:
      input.docsRequired > 0 ? clamp((100 * input.docsDelivered) / input.docsRequired, 0, 100) : 0,
    consistency: CONSISTENCY_POINTS[input.financialConsistency],
    growth: (100 * (clamp(input.cagr3y, -0.1, 0.3) + 0.1)) / 0.4,
    margin: (100 * clamp(input.ebitdaMargin, 0, 0.3)) / 0.3,
    risks: (RISK_POINTS[input.customerDependency] + RISK_POINTS[input.legalContingencies]) / 2,
  };
  const sum =
    w.infoQuality * breakdown.infoQuality +
    w.consistency * breakdown.consistency +
    w.growth * breakdown.growth +
    w.margin * breakdown.margin +
    w.risks * breakdown.risks;
  return { total: Math.round(sum), breakdown };
}
