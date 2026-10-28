import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { listNotifications, markAllNotificationsRead } from './notifications';

const tag = randomUUID().slice(0, 8);
let me = '';
let other = '';

async function user(name: string): Promise<string> {
  const u = await db.user.create({
    data: {
      email: `notif-${name}-${tag}@demo.ladorada.co`,
      passwordHash: 'x',
      name: `Usuario ${name}`,
      role: 'BUYER',
      status: 'ENABLED',
    },
  });
  return u.id;
}

beforeAll(async () => {
  const [row] = await db.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  expect(row?.current_database).toMatch(/_test$/);
  me = await user('yo');
  other = await user('otro');
  const base = Date.now() - 60_000;
  for (let i = 0; i < 12; i++) {
    await db.notification.create({
      data: {
        userId: me,
        kind: 'DEAL_OFFER_RECEIVED',
        payload: { dealId: `deal-${i}` },
        createdAt: new Date(base + i * 1000),
        readAt: i < 2 ? new Date() : null,
      },
    });
  }
  await db.notification.create({
    data: { userId: me, kind: 'LEGACY_KIND', payload: {}, createdAt: new Date(base - 5000) },
  });
  await db.notification.create({
    data: { userId: other, kind: 'ACCESS_APPROVED', payload: { opportunityId: 'x' } },
  });
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { userId: { in: [me, other] } } });
  await db.user.deleteMany({ where: { id: { in: [me, other] } } });
  await db.$disconnect();
});

describe('notifications', () => {
  it('lists only the actor’s latest 10, newest first, with the unread count', async () => {
    const v = await listNotifications({ id: me });
    expect(v.unread).toBe(11);
    expect(v.items).toHaveLength(10);
    expect(v.items[0]?.href).toBe('/processes/deal-11');
    expect(v.items.every((n) => n.title.length > 0)).toBe(true);
  });

  it('marks only the actor’s notifications as read', async () => {
    await markAllNotificationsRead({ id: me });
    expect((await listNotifications({ id: me })).unread).toBe(0);
    expect((await listNotifications({ id: other })).unread).toBe(1);
  });
});
