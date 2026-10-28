import { describe, expect, it } from 'vitest';
import {
  INFO_SECTIONS,
  INFO_SECTION_META,
  TEASER_SECTIONS,
  defaultVisibility,
  teaserVisibilityIssues,
} from './visibility';

describe('INFO_SECTION_META (slide10)', () => {
  it('describes every section in es-CO', () => {
    for (const s of INFO_SECTIONS) {
      expect(INFO_SECTION_META[s].label.length).toBeGreaterThan(3);
      expect(INFO_SECTION_META[s].description.length).toBeGreaterThan(10);
    }
    expect(INFO_SECTION_META.SUMMARY.label).toBe('Resumen ejecutivo');
    expect(INFO_SECTION_META.CAPEX.label).toBe('Plan de inversiones (CAPEX)');
  });

  it('keeps confidential sections out of the teaser', () => {
    const forbidden = INFO_SECTIONS.filter((s) => !INFO_SECTION_META[s].teaserAllowed);
    expect(forbidden).toEqual([
      'FINANCIAL_STATEMENTS',
      'CONTRACTS',
      'CAPEX',
      'LITIGATION',
      'SHAREHOLDERS',
      'PROJECTIONS',
    ]);
    for (const s of forbidden) expect(INFO_SECTION_META[s].defaultTeaser).toBe(false);
    expect(TEASER_SECTIONS).toEqual(['SUMMARY', 'BUSINESS', 'REVENUE', 'OPERATIONS']);
  });
});

describe('defaultVisibility', () => {
  it('has one row per section, all in the data room, teaser per slide10', () => {
    const rows = defaultVisibility();
    expect(rows.map((r) => r.section)).toEqual([...INFO_SECTIONS]);
    expect(rows.every((r) => r.inDataRoom)).toBe(true);
    expect(rows.filter((r) => r.inTeaser).map((r) => r.section)).toEqual([
      'SUMMARY',
      'BUSINESS',
      'REVENUE',
      'OPERATIONS',
    ]);
  });

  it('returns fresh rows each call', () => {
    const a = defaultVisibility();
    a[0]!.inTeaser = false;
    expect(defaultVisibility()[0]!.inTeaser).toBe(true);
  });
});

describe('teaserVisibilityIssues', () => {
  it('is empty for the default configuration', () => {
    expect(teaserVisibilityIssues(defaultVisibility())).toEqual([]);
  });

  it('asks for at least one teaser section', () => {
    expect(teaserVisibilityIssues([])).toEqual([expect.stringMatching(/al menos una sección/)]);
  });

  it('names confidential sections placed in the teaser', () => {
    const issues = teaserVisibilityIssues([
      { section: 'SUMMARY', inTeaser: true },
      { section: 'SHAREHOLDERS', inTeaser: true },
      { section: 'PROJECTIONS', inTeaser: true },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Estructura accionaria, Proyecciones financieras/);
  });
});
