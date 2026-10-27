import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { AUDIT_ACTIONS } from './actions';
import { writeAudit } from './audit';

const entry = {
  actorId: null,
  action: 'SEED_LOADED',
  entity: 'Seed',
  entityId: 'demo',
} as const;

describe('writeAudit', () => {
  it('throws when given a root PrismaClient instead of a transaction client', async () => {
    const executeRaw = vi.fn();
    const root = {
      $transaction: vi.fn(),
      $executeRaw: executeRaw,
    } as unknown as Prisma.TransactionClient;
    await expect(writeAudit(root, entry)).rejects.toThrow(/transaction client/i);
    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe('AUDIT_ACTIONS', () => {
  it('lists the actions in use plus the R2 ones', () => {
    for (const a of [
      'LOGIN_SUCCEEDED',
      'LOGIN_FAILED',
      'SEED_LOADED',
      'ACCESS_DENIED',
      'DOCUMENT_DOWNLOADED',
    ]) {
      expect(AUDIT_ACTIONS).toContain(a);
    }
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});
