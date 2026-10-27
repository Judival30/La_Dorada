import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { verifyAuditChain, writeAudit } from './audit';

const APPEND_ONLY = /audit_log is append-only/;

const entry = (n: number) => ({
  actorId: n % 2 === 0 ? `user_${n}` : null,
  action: 'TEST_ACTION',
  entity: 'Opportunity',
  entityId: `opp_${n}`,
  before: { status: 'DRAFT', amount: 12_000_000_000n },
  after: { status: 'IN_REVIEW', nested: { z: 1, a: [new Date('2026-01-01T00:00:00Z')] } },
  ip: '127.0.0.1',
});

beforeAll(async () => {
  // Safety net: these tests wipe AuditLog, so never run them outside a test DB.
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
});

beforeEach(async () => {
  // TRUNCATE is blocked by audit_log_no_truncate. Replica mode (scoped to this
  // transaction by SET LOCAL) disables ordinary triggers, TRUNCATE ones included.
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" RESTART IDENTITY');
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe('writeAudit / verifyAuditChain', () => {
  it('chains the second entry to the first and verifies ok', async () => {
    const first = await db.$transaction((tx) => writeAudit(tx, entry(1)));
    const second = await db.$transaction((tx) => writeAudit(tx, entry(2)));

    expect(first.prevHash).toBeNull();
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.prevHash).toBe(first.hash);
    expect(await verifyAuditChain()).toEqual({ ok: true });
  });

  it('rejects update, delete and truncate with an append-only error', async () => {
    const row = await db.$transaction((tx) => writeAudit(tx, entry(1)));

    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(APPEND_ONLY);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(APPEND_ONLY);
    await expect(db.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"')).rejects.toThrow(APPEND_ONLY);
    expect(await db.auditLog.count()).toBe(1);
  });

  it('keeps a valid chain under 20 concurrent writers', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        db.$transaction((tx) => writeAudit(tx, entry(i)), { maxWait: 10_000, timeout: 20_000 }),
      ),
    );

    expect(await db.auditLog.count()).toBe(20);
    expect(await verifyAuditChain()).toEqual({ ok: true });
  });

  it('rejects a second row claiming the same prevHash (fork)', async () => {
    const first = await db.$transaction((tx) => writeAudit(tx, entry(1)));
    await db.$transaction((tx) => writeAudit(tx, entry(2)));

    await expect(
      db.auditLog.create({
        data: {
          action: 'FORK',
          entity: 'X',
          entityId: 'x',
          prevHash: first.hash,
          hash: 'f'.repeat(64),
        },
      }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('detects a tampered row and reports its id', async () => {
    await db.$transaction((tx) => writeAudit(tx, entry(1)));
    const victim = await db.$transaction((tx) => writeAudit(tx, entry(2)));
    await db.$transaction((tx) => writeAudit(tx, entry(3)));

    // Bypass the trigger for this connection only (SET LOCAL ends with the tx).
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.$executeRaw`UPDATE "AuditLog" SET "action" = 'TAMPERED' WHERE "id" = ${victim.id}`;
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = DEFAULT');
    });

    expect(await verifyAuditChain()).toEqual({ ok: false, brokenAt: victim.id });
  });
});
