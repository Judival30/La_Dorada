'use client';

import { CircleAlert } from 'lucide-react';
import { useActionState, useRef } from 'react';
import { loginAction, type LoginState } from '@/server/auth/actions';

const DEMO_ACCOUNTS = [
  { label: 'Comprador', email: 'comprador@demo.ladorada.co' },
  { label: 'Vendedor', email: 'vendedor@demo.ladorada.co' },
  { label: 'Back Office', email: 'admin@demo.ladorada.co' },
] as const;

const DEMO_PASSWORD = 'LaDorada2026!';

type LoginFormProps = { next?: string; showDemo: boolean };

export function LoginForm({ next, showDemo }: LoginFormProps) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);

  function fillDemo(address: string) {
    if (email.current) email.current.value = address;
    if (password.current) password.current.value = DEMO_PASSWORD;
    password.current?.focus();
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="ld-small font-semibold text-ld-navy">
          Correo electrónico
        </label>
        <input
          ref={email}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="nombre@empresa.co"
          aria-invalid={state.error ? true : undefined}
          aria-describedby="login-error"
          className="ld-field"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="ld-small font-semibold text-ld-navy">
          Contraseña
        </label>
        <input
          ref={password}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby="login-error"
          className="ld-field"
        />
      </div>

      <div id="login-error" aria-live="polite" className="empty:hidden">
        {state.error ? (
          <p className="ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {state.error} Revisa los datos e intenta de nuevo.
            </span>
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={pending} className="ld-btn ld-btn-primary w-full">
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      {showDemo ? (
        <div className="border-t border-ld-border pt-5">
          <p className="ld-small text-ld-muted">Para probar la demostración, completa los datos con una cuenta:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => fillDemo(a.email)}
                className="ld-btn ld-btn-quiet min-h-10 px-3"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
