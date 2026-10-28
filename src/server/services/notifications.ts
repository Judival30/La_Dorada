import { db } from '@/server/db';
import { describeNotification } from '@/server/notify/describe';
import { NOTIFICATION_KINDS, type NotificationKind } from '@/server/notify/notify';

type Actor = { id: string };

export type NotificationItem = {
  id: string;
  title: string;
  href: string | null;
  createdAt: Date;
  read: boolean;
};

export type NotificationsView = { unread: number; items: NotificationItem[] };

const LATEST = 10;

const isKind = (k: string): k is NotificationKind =>
  (NOTIFICATION_KINDS as readonly string[]).includes(k);

/** The actor's unread count and latest notifications, newest first. */
export async function listNotifications(actor: Actor): Promise<NotificationsView> {
  const [unread, rows] = await Promise.all([
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
    db.notification.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: LATEST,
    }),
  ]);

  const payloads = rows.map((r) =>
    r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
      ? (r.payload as Record<string, unknown>)
      : {},
  );
  const oppIds = [
    ...new Set(
      payloads.map((p) => p.opportunityId).filter((v): v is string => typeof v === 'string'),
    ),
  ];
  const titles = new Map(
    (
      await db.opportunity.findMany({
        where: { id: { in: oppIds } },
        select: { id: true, title: true },
      })
    ).map((o) => [o.id, o.title]),
  );

  const items = rows.flatMap((r, i): NotificationItem[] => {
    if (!isKind(r.kind)) return [];
    const p = payloads[i] ?? {};
    const title =
      typeof p.opportunityId === 'string' ? (titles.get(p.opportunityId) ?? null) : null;
    const text = describeNotification(r.kind, p, title);
    return [{ id: r.id, ...text, createdAt: r.createdAt, read: r.readAt !== null }];
  });
  return { unread, items };
}

/** Marks every unread notification of the actor as read. */
export async function markAllNotificationsRead(actor: Actor): Promise<void> {
  await db.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}
