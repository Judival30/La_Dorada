'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/components/ld/action-button';
import { requireActor } from '@/server/auth/guard';
import { toActionError } from '@/server/http/errors';
import { getRequestContext } from '@/server/request-context';
import { requestAccess, signNda } from '@/server/services/access';

const idSchema = z.string().min(1).max(64);
const INVALID: ActionResult = { error: 'Revisa los datos e intenta de nuevo.' };

function refresh(opportunityId: string): void {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/acceso`);
}

export async function requestAccessAction(
  opportunityId: string,
  purpose: string,
): Promise<ActionResult> {
  const p = z
    .object({ opportunityId: idSchema, purpose: z.string().max(2000) })
    .safeParse({ opportunityId, purpose });
  if (!p.success) return INVALID;
  try {
    const actor = await requireActor('BUYER');
    await requestAccess(actor, p.data.opportunityId, { purpose: p.data.purpose });
    refresh(p.data.opportunityId);
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

export async function signNdaAction(
  opportunityId: string,
  accessRequestId: string,
  accepted: boolean,
): Promise<ActionResult> {
  const p = z
    .object({ opportunityId: idSchema, accessRequestId: idSchema, accepted: z.literal(true) })
    .safeParse({ opportunityId, accessRequestId, accepted });
  if (!p.success)
    return { error: 'Marca la casilla para confirmar que leíste y aceptas el acuerdo.' };
  try {
    const actor = await requireActor('BUYER');
    const ctx = await getRequestContext();
    await signNda(actor, p.data.accessRequestId, ctx);
    refresh(p.data.opportunityId);
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}
