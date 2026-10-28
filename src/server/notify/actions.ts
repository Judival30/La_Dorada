'use server';

import { revalidatePath } from 'next/cache';
import { requireActor } from '@/server/auth/guard';
import { markAllNotificationsRead } from '@/server/services/notifications';

export async function markAllNotificationsReadAction(): Promise<void> {
  const actor = await requireActor('BUYER', 'SELLER', 'BACKOFFICE');
  await markAllNotificationsRead(actor);
  revalidatePath('/', 'layout');
}
