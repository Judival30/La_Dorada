'use server';

import { redirect } from 'next/navigation';
import {
  REGISTER_ROLES,
  registerFormSchema,
  type RegisterField,
  type RegisterRole,
} from '@/domain/registration';
import { registerIpLimiter } from '@/server/auth/rate-limit';
import { setSessionCookie } from '@/server/auth/session';
import { toActionError } from '@/server/http/errors';
import { getRequestContext } from '@/server/request-context';
import { registerUser } from '@/server/services/registration';

export type RegisterState = {
  error?: string;
  fieldErrors?: Partial<Record<RegisterField, string>>;
  /** Echo of the non-secret fields so the form keeps them after an error. Never the password. */
  values?: { role?: RegisterRole; name?: string; email?: string; consent?: boolean };
};

const FIELD_ERROR_SUMMARY = 'Revisa los campos marcados para crear tu cuenta.';
const RATE_LIMITED_ERROR = 'Demasiados intentos de registro. Intenta de nuevo en 15 minutos.';
const FIELDS: RegisterField[] = ['role', 'name', 'email', 'password', 'consent'];

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : undefined);

export async function registerAction(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const raw = {
    role: str(form.get('role')),
    name: str(form.get('name')),
    email: str(form.get('email')),
    password: str(form.get('password')),
    consent: str(form.get('consent')),
  };
  const values: NonNullable<RegisterState['values']> = {
    role: REGISTER_ROLES.find((r) => r === raw.role),
    name: raw.name?.slice(0, 120),
    email: raw.email?.slice(0, 254),
    consent: raw.consent === 'on',
  };

  const parsed = registerFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: RegisterState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (FIELDS.includes(field as RegisterField) && !fieldErrors[field as RegisterField]) {
        fieldErrors[field as RegisterField] = issue.message;
      }
    }
    return { error: FIELD_ERROR_SUMMARY, fieldErrors, values };
  }

  const ctx = await getRequestContext();
  if (!registerIpLimiter.take(ctx.ip)) return { error: RATE_LIMITED_ERROR, values };

  let session: { token: string; expiresAt: Date };
  try {
    session = await registerUser(parsed.data, ctx);
  } catch (err) {
    return { ...toActionError(err), values };
  }
  await setSessionCookie(session.token, session.expiresAt);

  // Outside any try/catch: redirect() works by throwing NEXT_REDIRECT.
  redirect('/onboarding');
}
