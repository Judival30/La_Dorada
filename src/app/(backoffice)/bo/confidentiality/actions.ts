'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/components/ld/action-button';
import { requireActor } from '@/server/auth/guard';
import { toActionError } from '@/server/http/errors';
import { revokeAccess } from '@/server/services/access';

export async function revokeAccessAction(id: string): Promise<ActionResult> {
  const p = z.string().min(1).max(64).safeParse(id);
  if (!p.success) return { error: 'Revisa los datos e intenta de nuevo.' };
  try {
    const actor = await requireActor('BACKOFFICE');
    await revokeAccess(actor, p.data);
    revalidatePath('/bo/confidentiality');
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}
