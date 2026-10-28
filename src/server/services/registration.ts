import { Prisma } from '@prisma/client';
import { DEFAULT_KYC_CHECKLIST } from '@/domain/onboarding';
import { ValidationError } from '@/domain/errors';
import { registerInputSchema, type RegisterRole } from '@/domain/registration';
import { audited } from '@/server/audit/audited';
import { hashPassword } from '@/server/auth/password';
import { createSession } from '@/server/auth/session';
import type { RequestContext } from '@/server/request-context';

/** Same message whether or not the email exists: sign-up must not reveal accounts. */
export const DUPLICATE_EMAIL_ERROR =
  'No pudimos crear la cuenta con esos datos. Si ya tienes una, inicia sesión.';

export type RegisterUserInput = {
  role: RegisterRole;
  name: string;
  email: string;
  password: string;
  consent: true;
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Creates a PENDING user with Habeas Data consent, its OPEN verification case
 * (step 1) with the default KYC checklist, and a session, all in one audited
 * transaction (`USER_REGISTERED`, payload `{ role }` only).
 *
 * The password is hashed BEFORE touching the database so a taken email costs
 * the same as a new one (no timing oracle). Uniqueness is enforced by the
 * `User.email` unique index: a duplicate, including a concurrent one, fails
 * with P2002 inside the transaction, everything rolls back, and the caller
 * gets a `ValidationError` with the generic message.
 */
export async function registerUser(
  input: RegisterUserInput,
  ctx: RequestContext,
): Promise<{ userId: string; token: string; expiresAt: Date }> {
  // Defense in depth: callers parse already, but this is the trust boundary of the service.
  const data = registerInputSchema.parse(input);
  const passwordHash = await hashPassword(data.password);

  try {
    return await audited(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          name: data.name,
          role: data.role,
          status: 'PENDING',
          consentAt: new Date(),
        },
        select: { id: true },
      });
      await tx.verificationCase.create({
        data: {
          userId: user.id,
          step: 1,
          status: 'OPEN',
          checklist: { create: DEFAULT_KYC_CHECKLIST.map((label) => ({ label })) },
        },
      });
      const session = await createSession(user.id, {
        tx,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        result: { userId: user.id, ...session },
        audit: {
          actorId: user.id,
          action: 'USER_REGISTERED',
          entity: 'User',
          entityId: user.id,
          after: { role: data.role },
          ip: ctx.ip,
        },
      };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ValidationError(DUPLICATE_EMAIL_ERROR);
    throw err;
  }
}
