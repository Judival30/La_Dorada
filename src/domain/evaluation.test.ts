import { describe, expect, it } from 'vitest';
import {
  DATA_ROOM_FOLDERS,
  EVALUATION_ITEM_KINDS,
  EVALUATION_ITEM_META,
  EVALUATION_ITEM_STATUSES,
  EVALUATION_ITEM_STATUS_META,
  documentaryStatus,
  opportunityApprovalBlockers,
  toMatrixStatus,
  toRiskLevel,
  toScoreInput,
  type ApprovalInput,
  type EvaluationItemKind,
  type EvaluationItemStatus,
} from './evaluation';
import { millions } from './money';
import { computeScore } from './valuation';

describe('catalogs (slide13)', () => {
  it('labels the four matrix rows and five statuses in es-CO', () => {
    expect(EVALUATION_ITEM_KINDS.map((k) => EVALUATION_ITEM_META[k].label)).toEqual([
      'Verificación documental',
      'Consistencia financiera',
      'Dependencia de clientes',
      'Contingencias legales',
    ]);
    expect(EVALUATION_ITEM_STATUSES.map((s) => EVALUATION_ITEM_STATUS_META[s].label)).toEqual([
      'Completada',
      'Aprobada',
      'Riesgo medio',
      'Por aclarar',
      'Riesgo alto',
    ]);
  });

  it('defines 8 standard data room folders, the first 6 required', () => {
    expect(DATA_ROOM_FOLDERS.map((f) => f.name)).toEqual([
      'Estados financieros',
      'Declaraciones tributarias',
      'Contratos',
      'Clientes',
      'Proveedores',
      'Capex y activos fijos',
      'Litigios y contingencias',
      'Permisos y cumplimiento',
    ]);
    expect(DATA_ROOM_FOLDERS.map((f) => f.required)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(DATA_ROOM_FOLDERS.map((f) => f.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('P3 status mapping', () => {
  it.each([
    ['APPROVED', 'APPROVED', 'LOW'],
    ['COMPLETED', 'APPROVED', 'LOW'],
    ['TO_CLARIFY', 'TO_CLARIFY', 'TO_CLARIFY'],
    ['MEDIUM_RISK', 'RISK', 'MEDIUM'],
    ['HIGH_RISK', 'RISK', 'HIGH'],
  ] as const)('%s → %s / %s', (status, matrix, risk) => {
    expect(toMatrixStatus(status)).toBe(matrix);
    expect(toRiskLevel(status)).toBe(risk);
  });
});

describe('documentaryStatus', () => {
  it('is COMPLETED only when every required folder has documents', () => {
    expect(documentaryStatus(6, 6)).toBe('COMPLETED');
    expect(documentaryStatus(5, 6)).toBe('TO_CLARIFY');
    expect(documentaryStatus(0, 0)).toBe('TO_CLARIFY');
  });
});

describe('toScoreInput (single source = EvaluationItem)', () => {
  const items = (
    s: Partial<Record<EvaluationItemKind, EvaluationItemStatus>>,
  ): { kind: EvaluationItemKind; status: EvaluationItemStatus }[] =>
    Object.entries(s).map(([kind, status]) => ({
      kind: kind as EvaluationItemKind,
      status: status as EvaluationItemStatus,
    }));

  // M1 example: 26/30 docs, APPROVED, CAGR 18 %, margin 17,5 %, MEDIUM, TO_CLARIFY → 78.
  // First year revenue = 12.000 / 1,18³ ≈ 7.303,5 M so the 3-year CAGR is 18 %.
  const m1 = {
    items: items({
      DOCUMENTARY: 'COMPLETED',
      FINANCIAL_CONSISTENCY: 'APPROVED',
      CUSTOMER_DEPENDENCY: 'MEDIUM_RISK',
      LEGAL_CONTINGENCIES: 'TO_CLARIFY',
    }),
    foldersDelivered: 26,
    foldersRequired: 30,
    financials: [
      { year: 2025, revenue: millions(12000), ebitda: millions(2100) },
      { year: 2021, revenue: millions(5000), ebitda: millions(100) },
      { year: 2022, revenue: millions(7303.5), ebitda: millions(900) },
      { year: 2023, revenue: millions(8600), ebitda: millions(1300) },
      { year: 2024, revenue: millions(10200), ebitda: millions(1700) },
    ],
  };

  it('reproduces the M1 score of 78', () => {
    const input = toScoreInput(m1);
    expect(input).toEqual({
      docsDelivered: 26,
      docsRequired: 30,
      financialConsistency: 'APPROVED',
      cagr3y: expect.closeTo(0.18, 4),
      ebitdaMargin: 0.175,
      customerDependency: 'MEDIUM',
      legalContingencies: 'TO_CLARIFY',
    });
    expect(computeScore(input).total).toBe(78);
  });

  it('treats missing items as TO_CLARIFY', () => {
    const input = toScoreInput({ ...m1, items: [] });
    expect(input.financialConsistency).toBe('TO_CLARIFY');
    expect(input.customerDependency).toBe('TO_CLARIFY');
    expect(input.legalContingencies).toBe('TO_CLARIFY');
  });

  it('uses the available span when fewer than 4 years exist', () => {
    const input = toScoreInput({
      ...m1,
      financials: [
        { year: 2024, revenue: millions(10000), ebitda: millions(-500) },
        { year: 2025, revenue: millions(11000), ebitda: millions(-100) },
      ],
    });
    expect(input.cagr3y).toBeCloseTo(0.1, 6);
    expect(input.ebitdaMargin).toBeCloseTo(-0.1 / 11, 6);
  });

  it('is neutral without usable financials', () => {
    expect(toScoreInput({ ...m1, financials: [] })).toMatchObject({ cagr3y: 0, ebitdaMargin: 0 });
    expect(
      toScoreInput({
        ...m1,
        financials: [{ year: 2025, revenue: 0n, ebitda: millions(10) }],
      }),
    ).toMatchObject({ cagr3y: 0, ebitdaMargin: 0 });
    expect(
      toScoreInput({
        ...m1,
        financials: [
          { year: 2024, revenue: 0n, ebitda: 0n },
          { year: 2025, revenue: millions(100), ebitda: millions(10) },
        ],
      }).cagr3y,
    ).toBe(0);
  });
});

describe('opportunityApprovalBlockers', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const ready = (): ApprovalInput => ({
    items: [
      { kind: 'DOCUMENTARY', status: 'COMPLETED' },
      { kind: 'FINANCIAL_CONSISTENCY', status: 'APPROVED' },
      { kind: 'CUSTOMER_DEPENDENCY', status: 'HIGH_RISK' },
      { kind: 'LEGAL_CONTINGENCIES', status: 'MEDIUM_RISK' },
    ],
    foldersDelivered: 6,
    foldersRequired: 6,
    financialYears: [{ year: 2023 }, { year: 2024 }, { year: 2025 }],
    evaluatedAt: new Date('2026-05-30T00:00:00Z'),
    lastChangeAt: new Date('2026-05-20T00:00:00Z'),
  });

  it('is empty when the evaluation is complete (risks do not block)', () => {
    expect(opportunityApprovalBlockers(ready(), now)).toEqual([]);
    expect(opportunityApprovalBlockers({ ...ready(), lastChangeAt: undefined }, now)).toEqual([]);
  });

  it('lists every blocker in es-CO', () => {
    const blockers = opportunityApprovalBlockers(
      {
        items: [{ kind: 'LEGAL_CONTINGENCIES', status: 'TO_CLARIFY' }],
        foldersDelivered: 4,
        foldersRequired: 6,
        financialYears: [{ year: 2025 }],
        evaluatedAt: null,
      },
      now,
    );
    expect(blockers).toEqual([
      'Falta evaluar «Consistencia financiera».',
      'Falta evaluar «Dependencia de clientes».',
      '«Contingencias legales» está por aclarar: resuélvelo o solicita ajustes al vendedor.',
      'Faltan documentos en 2 de 6 carpetas requeridas del data room.',
      'Faltan los estados financieros de al menos 3 años consecutivos para estimar la valoración.',
      'La evaluación aún no se ha calculado y guardado.',
    ]);
  });

  it('blocks a stale evaluation', () => {
    const b = opportunityApprovalBlockers(
      { ...ready(), lastChangeAt: new Date('2026-05-31T00:00:00Z') },
      now,
    );
    expect(b).toEqual([
      'La evaluación está desactualizada: la empresa cambió después del último cálculo.',
    ]);
  });

  it('blocks a data room without required folders', () => {
    expect(
      opportunityApprovalBlockers({ ...ready(), foldersDelivered: 0, foldersRequired: 0 }, now),
    ).toEqual(['El data room no tiene carpetas requeridas configuradas.']);
  });

  it('uses the current date by default', () => {
    expect(opportunityApprovalBlockers({ ...ready(), financialYears: [] })).toHaveLength(1);
  });
});
