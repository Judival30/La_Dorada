'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/components/ld/action-button';
import type { OfferInput } from '@/domain/deal';
import { requireActor } from '@/server/auth/guard';
import type { SessionUser } from '@/server/auth/session';
import { toActionError } from '@/server/http/errors';
import {
  acceptOffer,
  confirmClose,
  counterOffer,
  makeOffer,
  signLoi,
  startDueDiligence,
  withdraw,
} from '@/server/services/deal';

export type OfferActionResult = { ok: true; dealId: string } | { error: string };

const idSchema = z.string().min(1).max(64);
const INVALID = { error: 'Revisa los datos e intenta de nuevo.' } as const;

/** Only the fields the schema knows, as plain strings; the service validates them. */
const offerFields = z.object({
  preMoneyValue: z.string().max(32),
  stakePct: z.string().max(16),
  investmentType: z.string().max(64),
  paymentScheme: z.string().max(400),
  exclusivityDays: z.string().max(16),
  validUntil: z.string().max(40),
});

function refresh(dealId: string): void {
  revalidatePath(`/processes/${dealId}`);
  revalidatePath('/processes');
  revalidatePath('/seller/processes');
}

/**
 * A buyer's offer on an opportunity: creates the deal on the first offer, or is
 * the buyer's counter-offer while a deal is open (`makeOffer`).
 */
export async function makeOfferAction(
  opportunityId: string,
  input: OfferInput,
): Promise<OfferActionResult> {
  const id = idSchema.safeParse(opportunityId);
  const fields = offerFields.safeParse(input);
  if (!id.success || !fields.success) return INVALID;
  try {
    const actor = await requireActor('BUYER');
    const { dealId } = await makeOffer(actor, id.data, fields.data);
    refresh(dealId);
    revalidatePath(`/opportunities/${id.data}`);
    return { ok: true, dealId };
  } catch (err) {
    return toActionError(err);
  }
}

/** The owning seller's counter-offer on a deal. */
export async function counterOfferAction(
  dealId: string,
  input: OfferInput,
): Promise<OfferActionResult> {
  const id = idSchema.safeParse(dealId);
  const fields = offerFields.safeParse(input);
  if (!id.success || !fields.success) return INVALID;
  try {
    const actor = await requireActor('SELLER');
    await counterOffer(actor, id.data, fields.data);
    refresh(id.data);
    return { ok: true, dealId: id.data };
  } catch (err) {
    return toActionError(err);
  }
}

async function run(
  dealId: string,
  fn: (actor: SessionUser, id: string) => Promise<void>,
): Promise<ActionResult> {
  const id = idSchema.safeParse(dealId);
  if (!id.success) return INVALID;
  try {
    // Back Office reaches the services and is refused there too (R4).
    const actor = await requireActor('BUYER', 'SELLER', 'BACKOFFICE');
    await fn(actor, id.data);
    refresh(id.data);
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

export async function acceptOfferAction(dealId: string): Promise<ActionResult> {
  return run(dealId, (a, id) => acceptOffer(a, id));
}

export async function signLoiAction(dealId: string): Promise<ActionResult> {
  return run(dealId, (a, id) => signLoi(a, id));
}

export async function startDueDiligenceAction(dealId: string): Promise<ActionResult> {
  return run(dealId, (a, id) => startDueDiligence(a, id));
}

export async function confirmCloseAction(dealId: string): Promise<ActionResult> {
  return run(dealId, (a, id) => confirmClose(a, id));
}

export async function withdrawAction(dealId: string, reason: string): Promise<ActionResult> {
  const r = z.string().max(2000).safeParse(reason);
  if (!r.success) return INVALID;
  return run(dealId, (a, id) => withdraw(a, id, r.data));
}
