'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/components/ld/action-button';
import { requireActor } from '@/server/auth/guard';
import { toActionError } from '@/server/http/errors';
import { decideAccess, revokeAccess } from '@/server/services/access';

const idSchema = z.string().min(1).max(64);
const INVALID: ActionResult = { error: 'Revisa los datos e intenta de nuevo.' };

async function run(
  id: string,
  fn: (actorId: Awaited<ReturnType<typeof requireActor>>, id: string) => Promise<void>,
): Promise<ActionResult> {
  const p = idSchema.safeParse(id);
  if (!p.success) return INVALID;
  try {
    const actor = await requireActor('SELLER');
    await fn(actor, p.data);
    revalidatePath('/seller/access-requests');
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

export async function approveAccessAction(id: string): Promise<ActionResult> {
  return run(id, (a, rid) => decideAccess(a, rid, 'APPROVE'));
}

export async function rejectAccessAction(id: string): Promise<ActionResult> {
  return run(id, (a, rid) => decideAccess(a, rid, 'REJECT'));
}

export async function revokeAccessAction(id: string): Promise<ActionResult> {
  return run(id, (a, rid) => revokeAccess(a, rid));
}
