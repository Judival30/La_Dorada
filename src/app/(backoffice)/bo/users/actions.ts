'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { SessionUser } from '@/server/auth/session';
import { requireActor } from '@/server/auth/guard';
import { toActionError } from '@/server/http/errors';
import {
  blockUser,
  decideUser,
  reviewDocument,
  runKycScreening,
  toggleKycItem,
  unblockUser,
} from '@/server/services/user-review';

/** `message` is the confirmation shown to the reviewer; it reuses the button's verb. */
export type ReviewActionResult = { ok: true; message: string } | { error: string };

const idSchema = z.string().min(1).max(64);
const textSchema = z.string().max(2000);

const INVALID: ReviewActionResult = { error: 'Revisa los datos e intenta de nuevo.' };

function refresh(userId: string): void {
  revalidatePath(`/bo/users/${userId}`);
  revalidatePath('/bo/users');
  revalidatePath('/bo');
}

async function run(
  userId: string,
  message: string,
  fn: (actor: SessionUser) => Promise<unknown>,
): Promise<ReviewActionResult> {
  try {
    const actor = await requireActor('BACKOFFICE');
    await fn(actor);
    refresh(userId);
    return { ok: true, message };
  } catch (err) {
    return toActionError(err);
  }
}

export async function reviewDocumentAction(
  userId: string,
  documentId: string,
  status: 'APPROVED' | 'REJECTED',
): Promise<ReviewActionResult> {
  const p = z
    .object({ userId: idSchema, documentId: idSchema, status: z.enum(['APPROVED', 'REJECTED']) })
    .safeParse({ userId, documentId, status });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(
    data.userId,
    data.status === 'APPROVED' ? 'Documento aprobado' : 'Documento rechazado',
    (a) => reviewDocument(a, data.documentId, data.status),
  );
}

export async function toggleKycItemAction(
  userId: string,
  itemId: string,
  done: boolean,
): Promise<ReviewActionResult> {
  const p = z
    .object({ userId: idSchema, itemId: idSchema, done: z.boolean() })
    .safeParse({ userId, itemId, done });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(
    data.userId,
    data.done ? 'Ítem marcado como verificado' : 'Ítem desmarcado',
    (a) => toggleKycItem(a, data.itemId, data.done),
  );
}

export async function runKycScreeningAction(userId: string): Promise<ReviewActionResult> {
  const p = idSchema.safeParse(userId);
  if (!p.success) return INVALID;
  try {
    const actor = await requireActor('BACKOFFICE');
    const result = await runKycScreening(actor, p.data);
    refresh(p.data);
    return {
      ok: true,
      message:
        result.matches.length === 0
          ? 'Consulta simulada sin coincidencias. El ítem quedó verificado'
          : `Consulta simulada con ${result.matches.length} coincidencias. Revisa el ítem a mano`,
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function approveUserAction(userId: string): Promise<ReviewActionResult> {
  const p = idSchema.safeParse(userId);
  if (!p.success) return INVALID;
  return run(p.data, 'Registro aprobado', (a) => decideUser(a, p.data, { kind: 'APPROVE' }));
}

export async function requestCorrectionsAction(
  userId: string,
  notes: string,
): Promise<ReviewActionResult> {
  const p = z.object({ userId: idSchema, notes: textSchema }).safeParse({ userId, notes });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.userId, 'Correcciones solicitadas', (a) =>
    decideUser(a, data.userId, { kind: 'REQUEST_CORRECTIONS', notes: data.notes }),
  );
}

export async function rejectUserAction(
  userId: string,
  reason: string,
): Promise<ReviewActionResult> {
  const p = z.object({ userId: idSchema, reason: textSchema }).safeParse({ userId, reason });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.userId, 'Registro rechazado', (a) =>
    decideUser(a, data.userId, { kind: 'REJECT', reason: data.reason }),
  );
}

export async function blockUserAction(
  userId: string,
  reason: string,
): Promise<ReviewActionResult> {
  const p = z.object({ userId: idSchema, reason: textSchema }).safeParse({ userId, reason });
  if (!p.success) return INVALID;
  const { data } = p;
  return run(data.userId, 'Cuenta bloqueada', (a) => blockUser(a, data.userId, data.reason));
}

export async function unblockUserAction(userId: string): Promise<ReviewActionResult> {
  const p = idSchema.safeParse(userId);
  if (!p.success) return INVALID;
  return run(p.data, 'Cuenta desbloqueada', (a) => unblockUser(a, p.data));
}
