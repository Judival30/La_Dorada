import { defineMachine } from '@/domain/state-machine';

export const OPPORTUNITY_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'ADJUSTMENTS_REQUESTED',
  'PUBLISHED',
  'REJECTED',
  'SUSPENDED',
  'WITHDRAWN_BY_SELLER',
  'CLOSED',
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_EVENTS = [
  'SUBMIT',
  'REQUEST_ADJUSTMENTS',
  'RESUBMIT',
  'APPROVE_AND_PUBLISH',
  'REJECT',
  'SUSPEND',
  'REINSTATE',
  'WITHDRAW',
  'CLOSE',
] as const;
export type OpportunityEvent = (typeof OPPORTUNITY_EVENTS)[number];

export const opportunityMachine = defineMachine<OpportunityStatus, OpportunityEvent>(
  'opportunity',
  OPPORTUNITY_STATUSES,
  [
    { from: 'DRAFT', event: 'SUBMIT', to: 'IN_REVIEW', actors: ['SELLER'] },
    {
      from: 'IN_REVIEW',
      event: 'REQUEST_ADJUSTMENTS',
      to: 'ADJUSTMENTS_REQUESTED',
      actors: ['BACKOFFICE'],
    },
    { from: 'ADJUSTMENTS_REQUESTED', event: 'RESUBMIT', to: 'IN_REVIEW', actors: ['SELLER'] },
    // R1: only Back Office publishes; a seller never self-publishes.
    { from: 'IN_REVIEW', event: 'APPROVE_AND_PUBLISH', to: 'PUBLISHED', actors: ['BACKOFFICE'] },
    { from: 'IN_REVIEW', event: 'REJECT', to: 'REJECTED', actors: ['BACKOFFICE'] },
    { from: 'PUBLISHED', event: 'SUSPEND', to: 'SUSPENDED', actors: ['BACKOFFICE'] },
    { from: 'SUSPENDED', event: 'REINSTATE', to: 'PUBLISHED', actors: ['BACKOFFICE'] },
    { from: 'PUBLISHED', event: 'WITHDRAW', to: 'WITHDRAWN_BY_SELLER', actors: ['SELLER'] },
    { from: 'PUBLISHED', event: 'CLOSE', to: 'CLOSED', actors: ['SYSTEM'] },
  ],
);
