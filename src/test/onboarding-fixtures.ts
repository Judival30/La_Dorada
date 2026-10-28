/**
 * Integration-test helpers for onboarding (test-only module): fictitious users,
 * their verification case, and cleanup that respects the Restrict FKs.
 */
import { randomUUID } from 'node:crypto';
import type { Role, UserStatus } from '@prisma/client';
import { db } from '@/server/db';

export type TestUser = { id: string; email: string; caseId: string | null };

/** Creates a user (and, for BUYER/SELLER, an OPEN verification case) tagged for cleanup. */
export async function createTestUser(
  tag: string,
  role: Role,
  status: UserStatus = 'PENDING',
): Promise<TestUser> {
  const email = `onb-${role.toLowerCase()}-${randomUUID().slice(0, 6)}-${tag}@demo.ladorada.co`;
  const user = await db.user.create({
    data: {
      email,
      passwordHash: 'x',
      name: 'Usuario Prueba',
      role,
      status,
      consentAt: new Date(),
    },
  });
  if (role === 'BACKOFFICE') return { id: user.id, email, caseId: null };
  const caseStatus =
    status === 'CORRECTIONS_REQUESTED'
      ? 'CORRECTIONS_REQUESTED'
      : status === 'IN_REVIEW'
        ? 'IN_REVIEW'
        : 'OPEN';
  const vc = await db.verificationCase.create({ data: { userId: user.id, status: caseStatus } });
  return { id: user.id, email, caseId: vc.id };
}

/** Deletes every user whose email contains `tag`, children first. */
export async function cleanupTestUsers(tag: string): Promise<void> {
  const users = await db.user.findMany({
    where: { email: { contains: tag } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const cases = await db.verificationCase.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const caseIds = cases.map((c) => c.id);
  await db.kycChecklistItem.deleteMany({ where: { verificationCaseId: { in: caseIds } } });
  await db.verificationDocument.deleteMany({ where: { verificationCaseId: { in: caseIds } } });
  await db.verificationCase.deleteMany({ where: { id: { in: caseIds } } });
  await db.buyerPreferences.deleteMany({ where: { userId: { in: ids } } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

export const SELLER_STEPS = {
  1: { name: 'Valentina Ríos', phone: '+57 300 123 4567', position: 'Gerente general' },
  3: { isLegalRepresentative: true },
  4: {
    legalName: 'Cafés del Cauca S.A.S.',
    nit: '900.123.456-7',
    sector: 'AGROINDUSTRIA',
    department: 'Cauca',
    city: 'Popayán',
  },
} as const;

export const BUYER_STEPS = {
  1: { name: 'Andrés Gómez', phone: '3101234567', position: 'Socio' },
  3: { buyerType: 'FUND', entityName: 'Fondo Andino', entityNit: '901.234.567-8' },
  4: {
    sectors: ['SALUD', 'TECNOLOGIA'],
    regions: ['Antioquia', 'Bogotá D.C.'],
    ticketMinMillions: 500,
    ticketMaxMillions: 2500,
  },
} as const;
