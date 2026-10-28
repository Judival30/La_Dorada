'use client';

import { Building2, Check, ChevronDown, CircleAlert, Circle, Search } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { HABEAS_DATA_CONSENT, HABEAS_DATA_POLICY, LEGAL_REVIEW_NOTE } from '@/content/legal';
import {
  PASSWORD_CHECKS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  type RegisterRole,
} from '@/domain/registration';
import { registerAction, type RegisterState } from './actions';

const ROLE_OPTIONS: { value: RegisterRole; title: string; text: string; icon: ReactNode }[] = [
  {
    value: 'BUYER',
    title: 'Quiero invertir o comprar',
    text: 'Busca empresas privadas colombianas, revisa su información y presenta ofertas.',
    icon: <Search aria-hidden="true" className="size-5" />,
  },
  {
    value: 'SELLER',
    title: 'Quiero vender o recibir inversión',
    text: 'Publica tu empresa, decide qué información compartir y habla con compradores verificados.',
    icon: <Building2 aria-hidden="true" className="size-5" />,
  },
];

const PASSWORD_RULES: { key: keyof typeof PASSWORD_CHECKS; label: string }[] = [
  { key: 'length', label: `Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres` },
  { key: 'letter', label: 'Al menos una letra' },
  { key: 'digit', label: 'Al menos un número' },
];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="ld-small flex items-start gap-1.5 font-medium text-[var(--ld-danger-ink)]"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

const describedBy = (...ids: (string | false | undefined)[]) =>
  ids.filter(Boolean).join(' ') || undefined;

export function RegisterForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerAction, {});
  const [password, setPassword] = useState('');
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};

  return (
    // React resets the form after each submit; the reset event also clears the live password checks.
    <form
      action={action}
      onReset={() => setPassword('')}
      noValidate
      className="flex flex-col gap-6"
    >
      <fieldset
        aria-describedby={describedBy(fe.role && 'role-error')}
        aria-invalid={fe.role ? true : undefined}
        className="flex flex-col gap-2.5"
      >
        <legend className="ld-small mb-2.5 font-semibold text-ld-navy">
          ¿Cómo quieres usar La Dorada?
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="group relative flex cursor-pointer flex-col gap-2 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-4 transition-colors hover:border-[#b9c5e0] has-[:checked]:border-ld-primary has-[:checked]:bg-ld-primary-soft has-[:checked]:shadow-[inset_0_0_0_1px_var(--ld-primary)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ld-primary"
            >
              <input
                type="radio"
                name="role"
                value={o.value}
                defaultChecked={v.role === o.value}
                required
                className="sr-only"
              />
              <span className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-[var(--ld-radius-nav)] bg-ld-bg text-ld-navy group-has-[:checked]:bg-ld-surface group-has-[:checked]:text-ld-primary">
                  {o.icon}
                </span>
                <span
                  aria-hidden="true"
                  className="flex size-5 items-center justify-center rounded-full border border-[#b9c5e0] bg-ld-surface group-has-[:checked]:border-ld-primary group-has-[:checked]:bg-ld-primary"
                >
                  <Check
                    className="hidden size-3.5 text-white group-has-[:checked]:block"
                    strokeWidth={3}
                  />
                </span>
              </span>
              <span className="font-display text-[1.0625rem] font-semibold leading-6 text-ld-navy">
                {o.title}
              </span>
              <span className="ld-small text-ld-muted">{o.text}</span>
            </label>
          ))}
        </div>
        <FieldError id="role-error" message={fe.role} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="ld-small font-semibold text-ld-navy">
          Nombre completo
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          defaultValue={v.name}
          aria-invalid={fe.name ? true : undefined}
          aria-describedby={describedBy(fe.name && 'name-error')}
          className="ld-field"
        />
        <FieldError id="name-error" message={fe.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="ld-small font-semibold text-ld-navy">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder="nombre@empresa.co"
          defaultValue={v.email}
          aria-invalid={fe.email ? true : undefined}
          aria-describedby={describedBy(fe.email && 'email-error')}
          className="ld-field"
        />
        <FieldError id="email-error" message={fe.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="ld-small font-semibold text-ld-navy">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fe.password ? true : undefined}
          aria-describedby={describedBy('password-rules', fe.password && 'password-error')}
          className="ld-field"
        />
        <ul id="password-rules" className="mt-1 flex flex-col gap-1">
          {PASSWORD_RULES.map((r) => {
            const ok = PASSWORD_CHECKS[r.key](password);
            return (
              <li
                key={r.key}
                className={`ld-small flex items-center gap-2 ${ok ? 'text-[var(--ld-success-ink)]' : 'text-ld-muted'}`}
              >
                {ok ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
                ) : (
                  <Circle aria-hidden="true" className="size-4 shrink-0" />
                )}
                <span>
                  {r.label}
                  <span className="sr-only">{ok ? ': cumplido' : ': pendiente'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <FieldError id="password-error" message={fe.password} />
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-surface p-4">
        <div className="flex items-start gap-3">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            defaultChecked={v.consent === true}
            aria-invalid={fe.consent ? true : undefined}
            aria-describedby={describedBy('consent-note', fe.consent && 'consent-error')}
            className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--ld-primary)]"
          />
          <label htmlFor="consent" className="ld-small cursor-pointer text-ld-ink">
            {HABEAS_DATA_CONSENT}
          </label>
        </div>
        <p id="consent-note" className="ld-note pl-8 text-ld-muted">
          {LEGAL_REVIEW_NOTE}
        </p>
        <details className="group pl-8">
          <summary className="ld-small inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-ld-primary underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            Leer la política resumida
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-2 border-l-2 border-ld-border pl-4">
            <p className="ld-small font-semibold text-ld-navy">{HABEAS_DATA_POLICY.title}</p>
            <dl className="mt-2 flex flex-col gap-2.5">
              {HABEAS_DATA_POLICY.sections.map((s) => (
                <div key={s.heading}>
                  <dt className="ld-small font-semibold text-ld-navy">{s.heading}</dt>
                  <dd className="ld-small max-w-[60ch] text-ld-ink">{s.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
        <FieldError id="consent-error" message={fe.consent} />
      </div>

      <div id="register-error" aria-live="polite" className="empty:hidden">
        {state.error ? (
          <p
            role="alert"
            className="ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {state.error}{' '}
              {state.error.includes('inicia sesión') ? (
                <Link href="/login" className="underline underline-offset-4">
                  Ir a iniciar sesión
                </Link>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className="ld-btn ld-btn-primary w-full">
        {pending ? 'Creando cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
