import { ForbiddenError } from '@/domain/errors';
import type { Role } from '@/domain/roles';
import type { UserStatus } from '@/domain/machines/user';

/**
 * Throws `ForbiddenError` unless the user is `ENABLED` and, when `roles` are given,
 * holds one of them. With no roles it only checks that the user is `ENABLED`.
 */
export function assertRole(user: { role: Role; status: UserStatus }, ...roles: Role[]): void {
  if (user.status !== 'ENABLED') {
    throw new ForbiddenError('User is not enabled');
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new ForbiddenError('Role not allowed');
  }
}
