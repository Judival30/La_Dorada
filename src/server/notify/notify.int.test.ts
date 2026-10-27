import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { audited } from '@/server/audit/audited';
import { notify } from './notify';

const tag = randomUUID().slice(0, 8);
let userId = '';

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  const user = await db.user.create({
    data: {
      email: `notify-${tag}@demo.ladorada.co`,
      passwordHash: 'x',
      name: 'Usuario Notificación',
      role: 'BUYER',
      status: 'ENABLED',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe('notify', () => {
  it('creates the Notification row inside audited', async () => {
    await audited(async (tx) => {
      await notify(tx, { userId, kind: 'ONBOARDING_SUBMITTED', payload: { tag, n: 1 } });
      return {
        result: null,
        audit: { actorId: null, action: 'ACCESS_DENIED', entity: 'Notification', entityId: tag },
      };
    });
    const rows = await db.notification.findMany({
      where: { userId, payload: { path: ['tag'], equals: tag } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('ONBOARDING_SUBMITTED');
    expect(rows[0]?.readAt).toBeNull();
  });

  it('leaves no row when the transaction fails', async () => {
    const t2 = `${tag}-fail`;
    await expect(
      audited(async (tx) => {
        await notify(tx, { userId, kind: 'ACCOUNT_BLOCKED', payload: { tag: t2 } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(
      await db.notification.count({ where: { userId, payload: { path: ['tag'], equals: t2 } } }),
    ).toBe(0);
  });
});
