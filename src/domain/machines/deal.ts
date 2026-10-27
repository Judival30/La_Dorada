import { defineMachine } from '@/domain/state-machine';

export const DEAL_STATUSES = [
  'OFFER_SENT',
  'COUNTER_OFFER',
  'PRELIMINARY_AGREEMENT',
  'LOI_SIGNED',
  'DUE_DILIGENCE',
  'CLOSED',
  'WITHDRAWN',
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_EVENTS = [
  'COUNTER',
  'ACCEPT',
  'SIGN_LOI',
  'START_DD',
  'RENEGOTIATE',
  'CONFIRM_CLOSE',
  'WITHDRAW',
] as const;
export type DealEvent = (typeof DEAL_EVENTS)[number];

export const TERMINAL_DEAL_STATUSES = ['CLOSED', 'WITHDRAWN'] as const;

const PARTIES = ['BUYER', 'SELLER'] as const;

/**
 * Negotiation machine. R4: no definition includes BACKOFFICE. Who counts as the
 * counterparty for ACCEPT, and the double signature of LOI/close, are resolved by
 * services (M4), not here.
 */
export const dealMachine = defineMachine<DealStatus, DealEvent>('deal', DEAL_STATUSES, [
  { from: 'OFFER_SENT', event: 'COUNTER', to: 'COUNTER_OFFER', actors: ['SELLER'] },
  { from: 'COUNTER_OFFER', event: 'COUNTER', to: 'OFFER_SENT', actors: ['BUYER'] },
  {
    from: ['OFFER_SENT', 'COUNTER_OFFER'],
    event: 'ACCEPT',
    to: 'PRELIMINARY_AGREEMENT',
    actors: PARTIES,
  },
  { from: 'PRELIMINARY_AGREEMENT', event: 'SIGN_LOI', to: 'LOI_SIGNED', actors: PARTIES },
  { from: 'LOI_SIGNED', event: 'START_DD', to: 'DUE_DILIGENCE', actors: PARTIES },
  { from: 'DUE_DILIGENCE', event: 'RENEGOTIATE', to: 'COUNTER_OFFER', actors: PARTIES },
  { from: 'DUE_DILIGENCE', event: 'CONFIRM_CLOSE', to: 'CLOSED', actors: PARTIES },
  // R5: withdrawal is possible from every non-terminal state.
  {
    from: ['OFFER_SENT', 'COUNTER_OFFER', 'PRELIMINARY_AGREEMENT', 'LOI_SIGNED', 'DUE_DILIGENCE'],
    event: 'WITHDRAW',
    to: 'WITHDRAWN',
    actors: PARTIES,
  },
]);
