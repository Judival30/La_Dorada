import type { Role } from '@/domain/roles';
import type { UserStatus } from '@/domain/machines/user';
import type { OpportunityStatus } from '@/domain/machines/opportunity';
import type { AccessStatus } from '@/domain/machines/access';
import { isPartyConflict } from '@/domain/policies/parties';

/** Mirrors `NdaSignature` (`expiresAt` is NOT NULL); `signedAt: null` means not yet signed. */
export type NdaInfo = { signedAt: Date | null; expiresAt: Date };
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
 * NDA state at `now` (spec §6: `signedAt != null && expiresAt > now`). Fails closed:
 * - missing NDA or `signedAt` → `PENDING`;
 * - missing `expiresAt` or an invalid window (`signedAt >= expiresAt`) → `EXPIRED`;
 * - `signedAt > now` (signed in the future) → `PENDING`;
 * - `expiresAt <= now` → `EXPIRED` (the boundary instant counts as expired);
 * - otherwise `SIGNED`.
 */
export function ndaState(nda: NdaInfo | null, now: Date): NdaState {
  if (!nda?.signedAt) return 'PENDING';
  // Defensive: the type says non-null, but untyped callers must never fail open.
  if (!(nda.expiresAt instanceof Date)) return 'EXPIRED';
  const signed = nda.signedAt.getTime();
  const expires = nda.expiresAt.getTime();
  if (signed >= expires) return 'EXPIRED';
  if (signed > now.getTime()) return 'PENDING';
  return expires > now.getTime() ? 'SIGNED' : 'EXPIRED';
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
