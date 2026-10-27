export type Role = 'BUYER' | 'SELLER' | 'BACKOFFICE';

/** Actor performing a transition or mutation: a human role or the system itself. */
export type Actor = Role | 'SYSTEM';
