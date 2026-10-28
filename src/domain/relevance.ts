import type { Sector } from '@/domain/sectors';

/** Buyer preferences relevant to scoring (mirrors `BuyerPreferences`). */
export type RelevancePreferences = {
  sectors: readonly Sector[];
  regions: readonly string[];
  ticketMin: bigint | null;
  ticketMax: bigint | null;
};

export type RelevanceOpportunity = {
  sector: Sector;
  department: string;
  dealSizeMin: bigint | null;
  dealSizeMax: bigint | null;
};

/** Score used when the buyer has no preferences on file. */
export const DEFAULT_RELEVANCE = 50;

const SECTOR_POINTS = 50;
const REGION_POINTS = 30;
const TICKET_POINTS = 20;

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** True when [aMin, aMax] and [bMin, bMax] intersect; a null bound is open. */
function overlaps(
  aMin: bigint | null,
  aMax: bigint | null,
  bMin: bigint | null,
  bMax: bigint | null,
): boolean {
  if (aMin === null && aMax === null) return false;
  if (bMin === null && bMax === null) return false;
  const lowOk = aMax === null || bMin === null || bMin <= aMax;
  const highOk = bMax === null || aMin === null || aMin <= bMax;
  return lowOk && highOk;
}

/**
 * Simple 0–100 fit between a buyer and an opportunity, shown to the seller:
 * sector match 50 + region (department) match 30 + ticket overlap 20.
 * No preferences → `DEFAULT_RELEVANCE`.
 */
export function computeRelevance(
  prefs: RelevancePreferences | null,
  opp: RelevanceOpportunity,
): number {
  if (!prefs) return DEFAULT_RELEVANCE;
  let score = 0;
  if (prefs.sectors.includes(opp.sector)) score += SECTOR_POINTS;
  const dept = norm(opp.department);
  if (prefs.regions.some((r) => norm(r) === dept)) score += REGION_POINTS;
  if (overlaps(prefs.ticketMin, prefs.ticketMax, opp.dealSizeMin, opp.dealSizeMax)) {
    score += TICKET_POINTS;
  }
  return score;
}
