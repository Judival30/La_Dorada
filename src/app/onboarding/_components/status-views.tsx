import { Clock, LogOut, Mail } from 'lucide-react';
import { Logo } from '@/components/ld/logo';
import { StatusChip } from '@/components/ld/status-chip';
import { logoutAction } from '@/server/auth/actions';
import type { OnboardingView } from '@/server/services/onboarding';
import { formatDate } from './format';
import { ReviewSummary } from './review-summary';

/** Demo contact (fictional domain). */
export const SUPPORT_EMAIL = 'soporte@ladorada.co';

export function OnboardingHeader() {
  return (
    <header className="flex items-center justify-between border-b border-ld-border bg-ld-surface px-4 py-3 md:px-10">
      <Logo />
      <form action={logoutAction}>
        <button
          type="submit"
          className="ld-btn ld-btn-quiet min-h-11 shrink-0 px-3 whitespace-nowrap"
        >
          <LogOut aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Cerrar sesión</span>
        </button>
      </form>
    </header>
  );
}

export function InReviewView({ view, firstName }: { view: OnboardingView; firstName: string }) {
  return (
    <main id="contenido" className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <p className="ld-small text-ld-muted">Hola, {firstName}</p>
      <section
        aria-labelledby="review-title"
        className="mt-3 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-6 md:p-8"
      >
        <StatusChip tone="info">En revisión</StatusChip>
        <h1 id="review-title" className="ld-h1 mt-4">
          Estamos revisando tu registro
        </h1>
        <p className="mt-3 max-w-[60ch] text-ld-ink">
          Nuestro equipo está verificando tu información y tus documentos.
        </p>

        <div className="mt-6 flex items-start gap-4 rounded-[var(--ld-radius-control)] bg-ld-primary-soft p-4">
          <Clock aria-hidden="true" className="mt-1 size-6 shrink-0 text-ld-primary" />
          <div>
            <p className="font-display text-lg font-semibold text-ld-navy">
              Tiempo estimado: 1 a 2 días hábiles
            </p>
            {view.submittedAt ? (
              <p className="ld-small text-ld-muted">Enviado el {formatDate(view.submittedAt)}</p>
            ) : null}
          </div>
        </div>

        <p className="ld-small mt-4 flex max-w-[60ch] items-start gap-2 text-ld-ink">
          <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ld-muted" />
          Te enviaremos un correo y una notificación en la plataforma cuando tu cuenta esté lista.
          No necesitas hacer nada más.
        </p>

        <h2 className="ld-h3 mt-8 mb-4">Lo que enviaste</h2>
        <ReviewSummary view={view} editable={false} />
      </section>
    </main>
  );
}

export function RejectedView({ view, firstName }: { view: OnboardingView; firstName: string }) {
  return (
    <main id="contenido" className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <p className="ld-small text-ld-muted">Hola, {firstName}</p>
      <section
        aria-labelledby="rejected-title"
        className="mt-3 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-6 md:p-8"
      >
        <StatusChip tone="danger">Registro no aprobado</StatusChip>
        <h1 id="rejected-title" className="ld-h1 mt-4">
          No pudimos aprobar tu registro
        </h1>
        <p className="mt-3 max-w-[60ch] text-ld-ink">
          Tu solicitud no cumplió los requisitos de verificación.
        </p>
        {view.rejectionReason ? (
          <div className="mt-5 rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-bg p-4">
            <h2 className="ld-small font-semibold text-ld-navy">Motivo</h2>
            <p className="mt-1 max-w-[60ch] whitespace-pre-line text-ld-ink">
              {view.rejectionReason}
            </p>
          </div>
        ) : null}
        <p className="mt-5 max-w-[60ch] text-ld-ink">
          Si crees que hubo un error, escríbenos a{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ld-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          o responde al correo en el que te lo notificamos y revisaremos tu caso.
        </p>
      </section>
    </main>
  );
}

export function BlockedView({ firstName }: { firstName: string }) {
  return (
    <main id="contenido" className="mx-auto max-w-2xl px-4 py-10 md:py-16">
      <p className="ld-small text-ld-muted">Hola, {firstName}</p>
      <section
        aria-labelledby="blocked-title"
        className="mt-3 rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-6 md:p-8"
      >
        <StatusChip tone="danger">Cuenta bloqueada</StatusChip>
        <h1 id="blocked-title" className="ld-h1 mt-4">
          Tu cuenta está bloqueada
        </h1>
        <p className="mt-3 max-w-[60ch] text-ld-ink">
          Bloqueamos el acceso mientras Back Office revisa tu caso. Para recuperarlo, escríbenos a{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-ld-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          o responde al correo de notificación y te diremos qué falta.
        </p>
      </section>
    </main>
  );
}
