import type { Role } from '@/domain/roles';
import type { UserStatus } from '@/domain/machines/user';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import type { AccessStatus } from '@/domain/machines/access';
import { isPartyConflict } from '@/domain/policies/parties';

export type NdaInfo = { signedAt: Date | null; expiresAt: Date | null };
export type NdaState = 'PENDING' | 'SIGNED' | 'EXPIRED';

export type ConfidentialAccessContext = {
  user: { id: string; role: Role; status: UserStatus };
  opportunity: { sellerId: string; status: OpportunityStatus };
  access: { status: AccessStatus } | null;
  nda: NdaInfo | null;
  now: Date;
};

/** Opportunity statuses in which confidential documents may be shown to an authorized buyer. */
const CONFIDENTIAL_VISIBLE_STATUSES: readonly OpportunityStatus[] = ['PUBLISHED', 'CLOSED'];

/**
 * NDA state at `now`. Unsigned (or missing) is `PENDING`; no expiry means `SIGNED`;
 * `expiresAt <= now` is `EXPIRED` (the boundary instant counts as expired).
 */
export function ndaState(nda: NdaInfo | null, now: Date): NdaState {
  if (nda === null || nda.signedAt === null) return 'PENDING';
  if (nda.expiresAt === null) return 'SIGNED';
  return nda.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'SIGNED';
}

/**
 * Confidential-document gate (pure, never throws). True only when ALL hold:
 * user is an `ENABLED` `BUYER`; user is not the seller; opportunity is `PUBLISHED`
 * or `CLOSED`; access is `AUTHORIZED`; and the NDA is `SIGNED` (not pending/expired).
 */
export function canAccessConfidential(ctx: ConfidentialAccessContext): boolean {
  const { user, opportunity, access, nda, now } = ctx;
  return (
    user.role === 'BUYER' &&
    user.status === 'ENABLED' &&
    !isPartyConflict(user.id, opportunity) &&
    CONFIDENTIAL_VISIBLE_STATUSES.includes(opportunity.status) &&
    access?.status === 'AUTHORIZED' &&
    ndaState(nda, now) === 'SIGNED'
  );
}
