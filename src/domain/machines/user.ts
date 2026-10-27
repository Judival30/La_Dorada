import { defineMachine } from '@/domain/state-machine';

export const USER_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'CORRECTIONS_REQUESTED',
  'ENABLED',
  'REJECTED',
  'BLOCKED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_EVENTS = [
  'SUBMIT',
  'REQUEST_CORRECTIONS',
  'RESUBMIT',
  'APPROVE',
  'REJECT',
  'BLOCK',
  'UNBLOCK',
] as const;
export type UserEvent = (typeof USER_EVENTS)[number];

export const userMachine = defineMachine<UserStatus, UserEvent>('user', USER_STATUSES, [
  { from: 'PENDING', event: 'SUBMIT', to: 'IN_REVIEW', actors: ['BUYER', 'SELLER'] },
  {
    from: 'IN_REVIEW',
    event: 'REQUEST_CORRECTIONS',
    to: 'CORRECTIONS_REQUESTED',
    actors: ['BACKOFFICE'],
  },
  {
    from: 'CORRECTIONS_REQUESTED',
    event: 'RESUBMIT',
    to: 'IN_REVIEW',
    actors: ['BUYER', 'SELLER'],
  },
  { from: 'IN_REVIEW', event: 'APPROVE', to: 'ENABLED', actors: ['BACKOFFICE'] },
  { from: 'IN_REVIEW', event: 'REJECT', to: 'REJECTED', actors: ['BACKOFFICE'] },
  { from: 'ENABLED', event: 'BLOCK', to: 'BLOCKED', actors: ['BACKOFFICE'] },
  { from: 'BLOCKED', event: 'UNBLOCK', to: 'ENABLED', actors: ['BACKOFFICE'] },
]);
