'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PROFILE_SCHEMAS } from '@/domain/onboarding';
import { requireActorAnyStatus } from '@/server/auth/guard';
import { toActionError } from '@/server/http/errors';
import {
  deleteVerificationDocument,
  saveStep,
  submitForReview,
} from '@/server/services/onboarding';

export type ActionResult =
  | { ok: true }
  | {
      error: string;
      fieldErrors?: Record<string, string>;
      /** Echo of what the person typed, so the form keeps it after an error. */
      values?: Record<string, string | string[]>;
    };

type WizardStep = 1 | 3 | 4;

const FALLBACK: Record<string, string> = {
  name: 'Escribe tu nombre completo.',
  position: 'Escribe tu cargo.',
  phone: 'Escribe tu celular. Usa el formato +57 300 123 4567',
  isLegalRepresentative: 'Elige una opción.',
  buyerType: 'Elige a quién representas.',
  entityName: 'Indica el nombre de la entidad.',
  entityNit: 'Indica el NIT de la entidad.',
  legalName: 'Escribe la razón social.',
  nit: 'Escribe el NIT. Usa el formato 900.123.456-7',
  sector: 'Selecciona un sector.',
  department: 'Selecciona un departamento de la lista.',
  city: 'Escribe la ciudad.',
  sectors: 'Elige al menos un sector.',
  regions: 'Elige al menos un departamento.',
  ticketMinMillions: 'Indica el ticket mínimo en millones de pesos.',
  ticketMaxMillions: 'Indica el ticket máximo en millones de pesos.',
};

const SUMMARY = 'Revisa los campos marcados para guardar este paso.';

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

function list(form: FormData, key: string): string[] {
  return form.getAll(key).filter((v): v is string => typeof v === 'string');
}

/** "2.000" or "2000" → 2000; anything else → undefined (the schema then reports it). */
function millions(form: FormData, key: string): number | undefined {
  const raw = text(form, key).replace(/[.\s]/g, '');
  if (raw === '' || !/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

const ECHO_KEYS = new Set([
  'name',
  'phone',
  'position',
  'isLegalRepresentative',
  'buyerType',
  'entityName',
  'entityNit',
  'legalName',
  'nit',
  'sector',
  'department',
  'city',
  'sectors',
  'regions',
  'ticketMinMillions',
  'ticketMaxMillions',
]);

function echo(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (!ECHO_KEYS.has(key)) continue;
    const all = list(form, key);
    out[key] = all.length > 1 || key === 'sectors' || key === 'regions' ? all : (all[0] ?? '');
  }
  return out;
}

function toFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; code: string; message: string }[],
  form: FormData,
) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '');
    if (!field || out[field]) continue;
    // Domain messages for patterns and cross-field rules are already written for people.
    const own =
      (issue.code === 'custom' || issue.code === 'invalid_format') && text(form, field) !== '';
    out[field] = own ? issue.message : (FALLBACK[field] ?? 'Revisa este campo.');
  }
  return out;
}

function payloadFor(step: WizardStep, role: 'BUYER' | 'SELLER', form: FormData): unknown {
  if (step === 1) {
    return {
      name: text(form, 'name'),
      phone: text(form, 'phone'),
      position: text(form, 'position'),
    };
  }
  if (step === 3) {
    if (role === 'SELLER') {
      const v = text(form, 'isLegalRepresentative');
      return { isLegalRepresentative: v === 'yes' ? true : v === 'no' ? false : undefined };
    }
    const buyerType = text(form, 'buyerType');
    return {
      buyerType: buyerType || undefined,
      entityName: buyerType === 'ANGEL' ? undefined : text(form, 'entityName') || undefined,
      entityNit: buyerType === 'ANGEL' ? undefined : text(form, 'entityNit') || undefined,
    };
  }
  if (role === 'SELLER') {
    return {
      legalName: text(form, 'legalName'),
      nit: text(form, 'nit'),
      sector: text(form, 'sector'),
      department: text(form, 'department'),
      city: text(form, 'city'),
    };
  }
  return {
    sectors: list(form, 'sectors'),
    regions: list(form, 'regions'),
    ticketMinMillions: millions(form, 'ticketMinMillions'),
    ticketMaxMillions: millions(form, 'ticketMaxMillions'),
  };
}

function schemaFor(step: WizardStep, role: 'BUYER' | 'SELLER') {
  if (step === 1) return PROFILE_SCHEMAS.step1;
  if (step === 3)
    return role === 'SELLER' ? PROFILE_SCHEMAS.step3Seller : PROFILE_SCHEMAS.step3Buyer;
  return role === 'SELLER' ? PROFILE_SCHEMAS.step4Seller : PROFILE_SCHEMAS.step4Buyer;
}

/**
 * Saves one wizard step. The form is parsed here only to give per-field messages;
 * the service validates again and decides whether the status still allows editing.
 */
export async function saveStepAction(
  step: WizardStep,
  _prev: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  // `step` arrives through bind(), so it is not trusted: check it at runtime.
  if (step !== 1 && step !== 3 && step !== 4) return { error: 'Paso inválido.' };
  try {
    const actor = await requireActorAnyStatus('BUYER', 'SELLER');
    if (actor.role !== 'BUYER' && actor.role !== 'SELLER') return { error: 'Rol no permitido.' };
    const data = payloadFor(step, actor.role, form);
    const parsed = schemaFor(step, actor.role).safeParse(data);
    if (!parsed.success) {
      return {
        error: SUMMARY,
        fieldErrors: toFieldErrors(parsed.error.issues, form),
        values: echo(form),
      };
    }
    await saveStep(actor.id, step, data);
  } catch (err) {
    return { ...toActionError(err), values: echo(form) };
  }
  revalidatePath('/onboarding');
  // Outside the try/catch (redirect throws). The page shows the "guardado" confirmation.
  redirect(`/onboarding?paso=${step + 1}&guardado=${step}`);
}

export async function submitAction(): Promise<ActionResult> {
  try {
    const actor = await requireActorAnyStatus('BUYER', 'SELLER');
    await submitForReview(actor.id);
    revalidatePath('/onboarding');
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireActorAnyStatus('BUYER', 'SELLER');
    await deleteVerificationDocument(actor.id, id);
    revalidatePath('/onboarding');
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}
