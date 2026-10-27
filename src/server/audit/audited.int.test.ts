import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { writeAudit } from './audit';
import { audited } from './audited';

const tag = randomUUID().slice(0, 8);

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
});

afterAll(async () => {
  await db.$disconnect();
});

describe('audited', () => {
  it('commits the mutation and its audit entry together and returns result', async () => {
    const key = `audited-${tag}-ok`;
    const result = await audited(async (tx) => {
      const s = await tx.setting.create({ data: { key, value: { n: 1 } } });
      return {
        result: s.key,
        audit: { actorId: null, action: 'ACCESS_DENIED', entity: 'Setting', entityId: key },
      };
    });

    expect(result).toBe(key);
    expect(await db.setting.count({ where: { key } })).toBe(1);
    expect(await db.auditLog.count({ where: { entity: 'Setting', entityId: key } })).toBe(1);
    // Not verifyAuditChain(): other files deliberately leave tampered rows behind.
    const [last, prev] = await db.auditLog.findMany({ orderBy: { seq: 'desc' }, take: 2 });
    expect(last?.entityId).toBe(key);
    expect(last?.prevHash).toBe(prev?.hash ?? null);
  });

  it('writes several audit entries in order', async () => {
    const id = `audited-${tag}-many`;
    await audited(async () => ({
      result: null,
      audit: [
        { actorId: null, action: 'LOGIN_FAILED', entity: 'Multi', entityId: id },
        { actorId: null, action: 'ACCESS_DENIED', entity: 'Multi', entityId: id },
      ],
    }));
    const rows = await db.auditLog.findMany({
      where: { entity: 'Multi', entityId: id },
      orderBy: { seq: 'asc' },
    });
    expect(rows.map((r) => r.action)).toEqual(['LOGIN_FAILED', 'ACCESS_DENIED']);
  });

  it('rolls back the mutation when fn throws (no audit row either)', async () => {
    const key = `audited-${tag}-fail`;
    await expect(
      audited(async (tx) => {
        await tx.setting.create({ data: { key, value: 1 } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.setting.count({ where: { key } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: key } })).toBe(0);
  });
});

describe('writeAudit transaction guard', () => {
  it('rejects the root client (would audit outside the mutation transaction)', async () => {
    await expect(
      writeAudit(db, { actorId: null, action: 'ACCESS_DENIED', entity: 'X', entityId: 'x' }),
    ).rejects.toThrow(/transaction client/i);
  });

  it('accepts the interactive transaction client', async () => {
    const row = await db.$transaction((tx) =>
      writeAudit(tx, { actorId: null, action: 'ACCESS_DENIED', entity: 'X', entityId: tag }),
    );
    expect(row.entityId).toBe(tag);
  });
});
