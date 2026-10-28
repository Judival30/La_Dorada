'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { EVALUATION_ITEM_KINDS, EVALUATION_ITEM_STATUSES } from '@/domain/evaluation';
import { requireActor } from '@/server/auth/guard';
import type { SessionUser } from '@/server/auth/session';
import { toActionError } from '@/server/http/errors';
import { decideOpportunity, setEvaluationItem } from '@/server/services/opportunity-review';
import type { ReviewActionResult } from '../users/actions';

const idSchema = z.string().min(1).max(64);
const textSchema = z.string().max(2000);

const INVALID: ReviewActionResult = { error: 'Revisa los datos e intenta de nuevo.' };

function refresh(id: string): void {
  revalidatePath(`/bo/companies/${id}`);
  revalidatePath('/bo/companies');
  revalidatePath('/bo');
}

async function run(
  id: string,
  message: string,
  fn: (actor: SessionUser) => Promise<unknown>,
): Promise<ReviewActionResult> {
  try {
    const actor = await requireActor('BACKOFFICE');
    await fn(actor);
    refresh(id);
    return { ok: true, message };
  } catch (err) {
    return toActionError(err);
  }
}

export async function setEvaluationItemAction(
  opportunityId: string,
  kind: string,
  status: string,
  notes: string,
): Promise<ReviewActionResult> {
  const p = z
    .object({
      id: idSchema,
      kind: z.enum(EVALUATION_ITEM_KINDS),
      status: z.enum(EVALUATION_ITEM_STATUSES),
      notes: z.string().max(500),
    })
    .safeParse({ id: opportunityId, kind, status, notes });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.id, 'Evaluación guardada', (a) =>
    setEvaluationItem(a, data.id, data.kind, data.status, data.notes),
  );
}

export async function approveOpportunityAction(id: string): Promise<ReviewActionResult> {
  const p = idSchema.safeParse(id);
  if (!p.success) return INVALID;
  return run(p.data, 'Oportunidad aprobada y publicada', (a) =>
    decideOpportunity(a, p.data, { kind: 'APPROVE_AND_PUBLISH' }),
  );
}

export async function requestAdjustmentsAction(
  id: string,
  notes: string,
): Promise<ReviewActionResult> {
  const p = z.object({ id: idSchema, notes: textSchema }).safeParse({ id, notes });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.id, 'Ajustes solicitados', (a) =>
    decideOpportunity(a, data.id, { kind: 'REQUEST_ADJUSTMENTS', notes: data.notes }),
  );
}

export async function rejectOpportunityAction(
  id: string,
  reason: string,
): Promise<ReviewActionResult> {
  const p = z.object({ id: idSchema, reason: textSchema }).safeParse({ id, reason });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.id, 'Oportunidad rechazada', (a) =>
    decideOpportunity(a, data.id, { kind: 'REJECT', reason: data.reason }),
  );
}
