/**
 * Pins the "identical enums" constraint: every Prisma enum that mirrors a
 * domain literal set must have exactly the same values, in the same order.
 * Unit test: imports the generated client's enum objects, no DB connection.
 */
import {
  AccessStatus,
  DealStatus,
  EvaluationItemKind,
  EvaluationItemStatus,
  InfoSection,
  MatrixStatus,
  OfferAuthor,
  OpportunityStatus,
  OpportunityType,
  Role,
  RiskLevel,
  ReviewStatus,
  BuyerType,
  VerificationDocumentType,
  Sector,
  UserStatus,
} from '@prisma/client';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { EVALUATION_ITEM_KINDS, EVALUATION_ITEM_STATUSES } from '@/domain/evaluation';
import { ACCESS_STATUSES } from '@/domain/machines/access';
import { DEAL_STATUSES } from '@/domain/machines/deal';
import { OPPORTUNITY_STATUSES } from '@/domain/machines/opportunity';
import { USER_STATUSES } from '@/domain/machines/user';
import { BUYER_TYPES, REVIEW_STATUSES, VERIFICATION_DOCUMENT_TYPES } from '@/domain/onboarding';
import { OPPORTUNITY_TYPES } from '@/domain/opportunity';
import type { Role as DomainRole } from '@/domain/roles';
import { SECTORS } from '@/domain/sectors';
import type {
  MatrixStatus as DomainMatrixStatus,
  RiskLevel as DomainRiskLevel,
} from '@/domain/valuation';
import { INFO_SECTIONS } from '@/domain/visibility';

describe('Prisma enums mirror domain literals', () => {
  it.each([
    ['UserStatus', UserStatus, USER_STATUSES],
    ['OpportunityStatus', OpportunityStatus, OPPORTUNITY_STATUSES],
    ['AccessStatus', AccessStatus, ACCESS_STATUSES],
    ['DealStatus', DealStatus, DEAL_STATUSES],
    ['Sector', Sector, SECTORS],
    ['VerificationDocumentType', VerificationDocumentType, VERIFICATION_DOCUMENT_TYPES],
    ['BuyerType', BuyerType, BUYER_TYPES],
    ['ReviewStatus', ReviewStatus, REVIEW_STATUSES],
    ['OpportunityType', OpportunityType, OPPORTUNITY_TYPES],
    ['InfoSection', InfoSection, INFO_SECTIONS],
    ['EvaluationItemKind', EvaluationItemKind, EVALUATION_ITEM_KINDS],
    ['EvaluationItemStatus', EvaluationItemStatus, EVALUATION_ITEM_STATUSES],
  ] as const)('%s', (_name, prismaEnum, domain) => {
    expect(Object.values(prismaEnum)).toEqual([...domain]);
  });

  it('Role', () => {
    expect(Object.values(Role)).toEqual(['BUYER', 'SELLER', 'BACKOFFICE']);
    expectTypeOf<Role>().toEqualTypeOf<DomainRole>();
  });

  it('MatrixStatus and RiskLevel match src/domain/valuation types', () => {
    expect(Object.values(MatrixStatus)).toEqual(['APPROVED', 'TO_CLARIFY', 'RISK']);
    expect(Object.values(RiskLevel)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'TO_CLARIFY']);
    expectTypeOf<MatrixStatus>().toEqualTypeOf<DomainMatrixStatus>();
    expectTypeOf<RiskLevel>().toEqualTypeOf<DomainRiskLevel>();
  });

  it('OfferAuthor', () => {
    expect(Object.values(OfferAuthor)).toEqual(['BUYER', 'SELLER']);
  });
});
