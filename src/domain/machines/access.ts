import { defineMachine } from '@/domain/state-machine';

export const ACCESS_STATUSES = [
  'REQUESTED',
  'NDA_SIGNED',
  'AUTHORIZED',
  'REJECTED',
  'REVOKED',
] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const ACCESS_EVENTS = ['SIGN_NDA', 'APPROVE', 'REJECT', 'REVOKE'] as const;
export type AccessEvent = (typeof ACCESS_EVENTS)[number];

export const accessMachine = defineMachine<AccessStatus, AccessEvent>('access', ACCESS_STATUSES, [
  { from: 'REQUESTED', event: 'SIGN_NDA', to: 'NDA_SIGNED', actors: ['BUYER'] },
  { from: 'NDA_SIGNED', event: 'APPROVE', to: 'AUTHORIZED', actors: ['SELLER'] },
  { from: ['REQUESTED', 'NDA_SIGNED'], event: 'REJECT', to: 'REJECTED', actors: ['SELLER'] },
  { from: 'AUTHORIZED', event: 'REVOKE', to: 'REVOKED', actors: ['SELLER', 'BACKOFFICE'] },
]);
