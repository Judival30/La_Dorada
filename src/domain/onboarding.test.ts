import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KYC_CHECKLIST,
  DEPARTMENTS,
  DOCUMENT_LABELS,
  ONBOARDING_STEPS,
  PROFILE_SCHEMAS,
  onboardingProgress,
  requiredDocuments,
  type OnboardingSnapshot,
} from './onboarding';

type Doc = OnboardingSnapshot['documents'][number];

const step1 = { name: 'Luis Martínez', phone: '+57 300 123 4567', position: 'Gerente' };
const sellerStep4 = {
  legalName: 'Cafés de Antioquia S.A.S.',
  nit: '900.123.456-7',
  sector: 'AGROINDUSTRIA',
  department: 'Antioquia',
  city: 'Medellín',
} as const;

const doc = (type: Doc['type'], reviewStatus: Doc['reviewStatus'] = 'PENDING'): Doc => ({
  type,
  reviewStatus,
});

const sellerFull = (): OnboardingSnapshot => ({
  role: 'SELLER',
  profile: { step1, step3: { isLegalRepresentative: true }, step4: sellerStep4 },
  isLegalRepresentative: true,
  buyerType: null,
  hasPreferences: false,
  documents: [doc('NATIONAL_ID'), doc('CHAMBER_OF_COMMERCE'), doc('RUT')],
});

const empty = (role: 'BUYER' | 'SELLER'): OnboardingSnapshot => ({
  role,
  profile: {},
  isLegalRepresentative: null,
  buyerType: null,
  hasPreferences: false,
  documents: [],
});

describe('constants', () => {
  it('has six titled steps per role', () => {
    expect(ONBOARDING_STEPS.SELLER.map((s) => s.title)).toEqual([
      'Tu perfil personal',
      'Verificación de identidad',
      'Representación legal',
      'Información de la empresa',
      'Documentos de soporte',
      'Revisión y aprobación',
    ]);
    expect(ONBOARDING_STEPS.BUYER.map((s) => s.title)).toEqual([
      'Tu perfil',
      'Verificación de identidad',
      'A quién representas',
      'Criterios de inversión',
      'Documentos de soporte',
      'Revisión y aprobación',
    ]);
    expect(ONBOARDING_STEPS.BUYER.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('labels, checklist and departments', () => {
    expect(DOCUMENT_LABELS.NATIONAL_ID).toBe('Cédula de ciudadanía');
    expect(DEFAULT_KYC_CHECKLIST).toHaveLength(4);
    expect(DEPARTMENTS).toHaveLength(33);
    expect(DEPARTMENTS).toContain('Bogotá D.C.');
  });
});

describe('requiredDocuments', () => {
  it.each([
    ['SELLER', true, null, ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT']],
    ['SELLER', false, null, ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT', 'POWER_OF_ATTORNEY']],
    ['BUYER', null, 'FUND', ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT']],
    ['BUYER', null, 'STRATEGIC', ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT']],
    ['BUYER', null, 'FAMILY_OFFICE', ['NATIONAL_ID', 'CHAMBER_OF_COMMERCE', 'RUT']],
    ['BUYER', null, 'ANGEL', ['NATIONAL_ID', 'RUT']],
    ['BUYER', null, null, ['NATIONAL_ID']],
  ] as const)('%s rep=%s type=%s', (role, rep, buyerType, expected) => {
    expect(requiredDocuments({ role, isLegalRepresentative: rep, buyerType })).toEqual(expected);
  });
});

describe('PROFILE_SCHEMAS', () => {
  it('normalizes phones', () => {
    expect(PROFILE_SCHEMAS.step1.parse({ ...step1, phone: '300 123 4567' }).phone).toBe('+573001234567');
    expect(PROFILE_SCHEMAS.step1.parse(step1).phone).toBe('+573001234567');
  });
  it('rejects bad phone and short name', () => {
    expect(PROFILE_SCHEMAS.step1.safeParse({ ...step1, phone: '+57 200 123 4567' }).success).toBe(false);
    expect(PROFILE_SCHEMAS.step1.safeParse({ ...step1, name: 'A' }).success).toBe(false);
  });
  it('rejects an invalid NIT', () => {
    expect(PROFILE_SCHEMAS.step4Seller.safeParse({ ...sellerStep4, nit: '900123456-7' }).success).toBe(false);
    expect(PROFILE_SCHEMAS.step4Seller.safeParse(sellerStep4).success).toBe(true);
  });
  it('step3 seller and buyer', () => {
    expect(PROFILE_SCHEMAS.step3Seller.safeParse({ isLegalRepresentative: true }).success).toBe(true);
    expect(PROFILE_SCHEMAS.step3Seller.safeParse({}).success).toBe(false);
    expect(PROFILE_SCHEMAS.step3Buyer.safeParse({ buyerType: 'ANGEL' }).success).toBe(true);
    expect(PROFILE_SCHEMAS.step3Buyer.safeParse({ buyerType: 'FUND' }).success).toBe(false);
    expect(
      PROFILE_SCHEMAS.step3Buyer.safeParse({
        buyerType: 'FUND',
        entityName: 'Fondo X',
        entityNit: '900.123.456-7',
      }).success,
    ).toBe(true);
    expect(
      PROFILE_SCHEMAS.step3Buyer.safeParse({ buyerType: 'FUND', entityName: 'Fondo X', entityNit: 'abc' }).success,
    ).toBe(false);
  });
  it('step4 department and buyer regions must be Colombian departments', () => {
    expect(PROFILE_SCHEMAS.step4Seller.safeParse({ ...sellerStep4, department: 'Texas' }).success).toBe(false);
    expect(PROFILE_SCHEMAS.step4Seller.safeParse({ ...sellerStep4, department: 'Bogotá D.C.' }).success).toBe(true);
    const ok = { sectors: ['SALUD'], regions: ['Antioquia', 'Cauca'], ticketMinMillions: 1, ticketMaxMillions: 2 };
    expect(PROFILE_SCHEMAS.step4Buyer.safeParse(ok).success).toBe(true);
    expect(PROFILE_SCHEMAS.step4Buyer.safeParse({ ...ok, regions: ['Antioquia', 'Narnia'] }).success).toBe(false);
  });
  it('step4 seller city is trimmed, required and at most 80 characters', () => {
    const city = (c: string) => PROFILE_SCHEMAS.step4Seller.safeParse({ ...sellerStep4, city: c });
    expect(city('   ').success).toBe(false);
    expect(city('x'.repeat(81)).success).toBe(false);
    const ok = city('  Medellín  ');
    expect(ok.success && ok.data.city).toBe('Medellín');
  });
  it('step4 buyer ticket range', () => {
    const ok = { sectors: ['SALUD'], regions: ['Antioquia'], ticketMinMillions: 100, ticketMaxMillions: 500 };
    expect(PROFILE_SCHEMAS.step4Buyer.safeParse(ok).success).toBe(true);
    expect(PROFILE_SCHEMAS.step4Buyer.safeParse({ ...ok, ticketMaxMillions: 50 }).success).toBe(false);
    expect(PROFILE_SCHEMAS.step4Buyer.safeParse({ ...ok, sectors: [] }).success).toBe(false);
  });
});

describe('onboardingProgress', () => {
  it('empty seller snapshot cannot submit and lists every step', () => {
    const p = onboardingProgress(empty('SELLER'));
    expect(p.canSubmit).toBe(false);
    expect(p.completedSteps).toEqual([]);
    expect(p.missing.map((m) => m.step)).toEqual([1, 2, 3, 4, 5, 5]);
    expect(p.missing.find((m) => m.step === 2)?.reason).toBe(
      'Sube tu cédula de ciudadanía para verificar tu identidad.',
    );
    expect(p.missing.map((m) => m.reason)).toContain(
      'Falta el certificado de existencia y representación legal (Cámara de Comercio).',
    );
  });
  it('empty buyer snapshot', () => {
    const p = onboardingProgress(empty('BUYER'));
    expect(p.canSubmit).toBe(false);
    expect(p.missing.map((m) => m.step)).toEqual([1, 2, 3, 4]);
    expect(p.missing.find((m) => m.step === 3)?.reason).toMatch(/representas/);
  });
  it('complete legal-representative seller can submit', () => {
    const p = onboardingProgress(sellerFull());
    expect(p.canSubmit).toBe(true);
    expect(p.completedSteps).toEqual([1, 2, 3, 4, 5]);
    expect(p.missing).toEqual([]);
  });
  it('non-representative without power of attorney misses step 5', () => {
    const s = sellerFull();
    s.isLegalRepresentative = false;
    s.profile.step3 = { isLegalRepresentative: false };
    const p = onboardingProgress(s);
    expect(p.canSubmit).toBe(false);
    expect(p.completedSteps).toEqual([1, 2, 3, 4]);
    expect(p.missing).toEqual([
      {
        step: 5,
        reason:
          'Como no eres el representante legal, sube el poder o autorización que te permite actuar en nombre de la empresa.',
      },
    ]);
  });
  it('rejected documents count as missing', () => {
    const s = sellerFull();
    s.documents = [doc('NATIONAL_ID', 'REJECTED'), doc('CHAMBER_OF_COMMERCE', 'REJECTED'), doc('RUT', 'APPROVED')];
    const p = onboardingProgress(s);
    expect(p.canSubmit).toBe(false);
    expect(p.completedSteps).toEqual([1, 3, 4]);
    expect(p.missing).toEqual([
      { step: 2, reason: 'El Back Office rechazó tu Cédula de ciudadanía. Sube una nueva versión.' },
      { step: 5, reason: 'El Back Office rechazó tu Certificado de Cámara de Comercio. Sube una nueva versión.' },
    ]);
  });
  it('missing RUT and rejected power of attorney get specific reasons', () => {
    const s = sellerFull();
    s.isLegalRepresentative = false;
    s.documents = [doc('NATIONAL_ID'), doc('CHAMBER_OF_COMMERCE'), doc('POWER_OF_ATTORNEY', 'REJECTED')];
    const p = onboardingProgress(s);
    expect(p.missing.map((m) => m.reason)).toEqual([
      'Falta el RUT para validar la información tributaria.',
      'El Back Office rechazó tu Poder o autorización. Sube una nueva versión.',
    ]);
  });
  it('buyer completes with preferences flag and angel documents', () => {
    const p = onboardingProgress({
      role: 'BUYER',
      profile: { step1, step3: { buyerType: 'ANGEL' } },
      isLegalRepresentative: null,
      buyerType: 'ANGEL',
      hasPreferences: true,
      documents: [doc('NATIONAL_ID'), doc('RUT')],
    });
    expect(p.canSubmit).toBe(true);
  });
  it('buyer step 4 valid from profile', () => {
    const p = onboardingProgress({
      ...empty('BUYER'),
      profile: {
        step4: { sectors: ['SALUD'], regions: ['Valle del Cauca'], ticketMinMillions: 1, ticketMaxMillions: 2 },
      },
    });
    expect(p.completedSteps).toEqual([4]);
  });
  it('invalid profile data is reported as missing', () => {
    const s = sellerFull();
    s.profile.step1 = { ...step1, phone: 'x' };
    expect(onboardingProgress(s).missing[0]?.step).toBe(1);
  });
  it('buyer entity documents missing', () => {
    const s = empty('BUYER');
    s.buyerType = 'FUND';
    s.documents = [doc('NATIONAL_ID')];
    expect(onboardingProgress(s).missing.filter((m) => m.step === 5)).toHaveLength(2);
  });
});
