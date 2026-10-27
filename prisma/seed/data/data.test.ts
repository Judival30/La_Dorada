import { describe, expect, it } from 'vitest';
import { SECTORS } from '../../../src/domain/sectors';
import { SEED_COMPANIES } from './companies';
import { SEED_USERS } from './users';

const YEARS = [2021, 2022, 2023, 2024, 2025];

function statusCount(status: string): number {
  return SEED_COMPANIES.filter((c) => c.status === status).length;
}

describe('datos seed de demo', () => {
  it('tiene 15 empresas', () => {
    expect(SEED_COMPANIES).toHaveLength(15);
  });

  it('tiene 11 PUBLISHED, 2 IN_REVIEW, 1 DRAFT y 1 SUSPENDED', () => {
    expect(statusCount('PUBLISHED')).toBe(11);
    expect(statusCount('IN_REVIEW')).toBe(2);
    expect(statusCount('DRAFT')).toBe(1);
    expect(statusCount('SUSPENDED')).toBe(1);
  });

  it('cada empresa tiene financieros de 2021 a 2025', () => {
    for (const company of SEED_COMPANIES) {
      expect(company.financials.map((f) => f.year)).toEqual(YEARS);
    }
  });

  it('cubre los 10 sectores', () => {
    const present = new Set(SEED_COMPANIES.map((c) => c.sector));
    for (const sector of SECTORS) {
      expect(present.has(sector)).toBe(true);
    }
  });

  it('cubre al menos 6 departamentos', () => {
    const departments = new Set(SEED_COMPANIES.map((c) => c.department));
    expect(departments.size).toBeGreaterThanOrEqual(6);
  });

  it('tiene slugs y NIT únicos', () => {
    const slugs = new Set(SEED_COMPANIES.map((c) => c.slug));
    const nits = new Set(SEED_COMPANIES.map((c) => c.nit));
    expect(slugs.size).toBe(SEED_COMPANIES.length);
    expect(nits.size).toBe(SEED_COMPANIES.length);
  });

  it('cada ownerEmail es un vendedor ENABLED en SEED_USERS', () => {
    for (const company of SEED_COMPANIES) {
      const owner = SEED_USERS.find((u) => u.email === company.ownerEmail);
      expect(owner, company.ownerEmail).toBeDefined();
      expect(owner?.role).toBe('SELLER');
      expect(owner?.status).toBe('ENABLED');
    }
  });

  it('todos los correos están en minúsculas', () => {
    for (const user of SEED_USERS) {
      expect(user.email).toBe(user.email.toLowerCase());
    }
    for (const company of SEED_COMPANIES) {
      expect(company.ownerEmail).toBe(company.ownerEmail.toLowerCase());
    }
  });

  it('las 4 empresas nombradas tienen los números 2025 exactos', () => {
    const expected: Record<string, { type: string; revenue: number; ebitda: number }> = {
      'Cafés de Antioquia': { type: 'VENTA_PARCIAL', revenue: 12000, ebitda: 2100 },
      'Logística Caribe': { type: 'VENTA_TOTAL', revenue: 25000, ebitda: 4500 },
      'Tecnipagos Pyme': { type: 'LEVANTAMIENTO_CAPITAL', revenue: 8000, ebitda: -200 },
      AgroAndina: { type: 'SOCIO_ESTRATEGICO', revenue: 18000, ebitda: 3200 },
    };
    for (const [name, want] of Object.entries(expected)) {
      const company = SEED_COMPANIES.find((c) => c.name === name);
      expect(company, name).toBeDefined();
      expect(company?.status).toBe('PUBLISHED');
      expect(company?.opportunityType).toBe(want.type);
      const fin2025 = company?.financials.find((f) => f.year === 2025);
      expect(fin2025?.revenue).toBe(want.revenue);
      expect(fin2025?.ebitda).toBe(want.ebitda);
    }
  });
});
