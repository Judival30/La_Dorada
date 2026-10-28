import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, FolderLock, Hourglass, ShieldCheck, ShieldX } from 'lucide-react';
import { StatusChip } from '@/components/ld/status-chip';
import { NotFoundError } from '@/domain/errors';
import { formatDateTime, formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth/guard';
import { getAccessState, type BuyerAccessState } from '@/server/services/access';
import { RequestForm, SignForm } from './_components/access-forms';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Solicitar acceso' };

type Props = { params: Promise<{ id: string }> };

type StepState = 'done' | 'current' | 'todo' | 'stopped';

function stepsOf(s: BuyerAccessState): StepState[] {
  const st = s.request?.status;
  if (!st) return ['current', 'todo', 'todo'];
  if (st === 'REQUESTED') return ['done', 'current', 'todo'];
  if (st === 'NDA_SIGNED') return ['done', 'done', 'current'];
  if (st === 'AUTHORIZED')
    return s.needsSignature ? ['done', 'current', 'done'] : ['done', 'done', 'done'];
  if (st === 'REJECTED') return s.nda ? ['done', 'done', 'stopped'] : ['done', 'stopped', 'todo'];
  return ['done', 'done', 'stopped'];
}

const STEP_LABELS = ['Solicitud', 'Acuerdo de confidencialidad', 'Autorización del vendedor'];

function Stepper({ steps }: { steps: StepState[] }) {
  return (
    <ol className="mb-8 grid gap-3 sm:grid-cols-3 sm:gap-0">
      {STEP_LABELS.map((label, i) => {
        const state = steps[i] ?? 'todo';
        return (
          <li
            key={label}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 sm:border-t-2 sm:pt-3 sm:pr-4',
              state === 'done' && 'sm:border-[var(--ld-success)]',
              state === 'current' && 'sm:border-ld-primary',
              state === 'todo' && 'sm:border-ld-border-strong',
              state === 'stopped' && 'sm:border-[var(--ld-danger)]',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'ld-num flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                state === 'done' && 'bg-[var(--ld-success-soft)] text-[var(--ld-success-ink)]',
                state === 'current' && 'bg-ld-primary text-white',
                state === 'todo' && 'bg-[var(--ld-neutral-soft)] text-ld-muted',
                state === 'stopped' && 'bg-[var(--ld-danger-soft)] text-[var(--ld-danger-ink)]',
              )}
            >
              {state === 'done' ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="flex flex-col">
              <span
                className={cn(
                  'ld-small font-semibold',
                  state === 'todo' ? 'text-ld-muted' : 'text-ld-navy',
                )}
              >
                {label}
              </span>
              <span className="ld-note text-ld-muted">
                {state === 'done'
                  ? 'Listo'
                  : state === 'current'
                    ? 'En curso'
                    : state === 'stopped'
                      ? 'Detenido'
                      : 'Pendiente'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Evidence of the e-signature: the closest thing this flow has to a notary seal. */
function SignatureSeal({ nda }: { nda: NonNullable<BuyerAccessState['nda']> }) {
  const valid = nda.state === 'SIGNED';
  return (
    <dl className="ld-small mt-5 grid gap-x-6 gap-y-3 rounded-[var(--ld-radius-control)] border border-dashed border-ld-border-strong bg-[var(--ld-bg)] p-4 sm:grid-cols-[auto_1fr]">
      <dt className="text-ld-muted">Firmado</dt>
      <dd className="ld-num font-semibold text-ld-navy">{formatDateTime(nda.signedAt)}</dd>
      <dt className="text-ld-muted">{valid ? 'Vigente hasta' : 'Venció el'}</dt>
      <dd className="ld-num font-semibold text-ld-navy">{formatDay(nda.expiresAt)}</dd>
      <dt className="text-ld-muted">Huella del documento</dt>
      <dd
        className="ld-num break-all font-mono text-[0.8125rem] text-ld-ink"
        title={nda.documentHash}
      >
        {nda.documentHash.slice(0, 16)}…{nda.documentHash.slice(-8)}
      </dd>
    </dl>
  );
}

function MainPanel({ s }: { s: BuyerAccessState }) {
  const st = s.request?.status;
  const base = `/opportunities/${s.opportunity.id}`;

  if (!s.request) {
    return (
      <>
        <h2 className="ld-h2">Solicitar acceso</h2>
        <p className="mb-5 mt-1.5 max-w-prose text-ld-ink">
          Tu solicitud llega al vendedor con tu perfil verificado. Después firmas el acuerdo de
          confidencialidad y, cuando el vendedor apruebe, se abre el data room.
        </p>
        <RequestForm opportunityId={s.opportunity.id} />
      </>
    );
  }

  if (s.needsSignature) {
    const renewal = st === 'AUTHORIZED';
    return (
      <>
        <h2 className="ld-h2">
          {renewal
            ? 'Firma un nuevo acuerdo de confidencialidad'
            : 'Firmar acuerdo de confidencialidad'}
        </h2>
        <p className="mb-5 mt-1.5 max-w-prose text-ld-ink">
          {renewal
            ? 'Tu acuerdo anterior venció. Mientras no firmes uno nuevo, el data room permanece cerrado.'
            : 'Lee el acuerdo completo. Al firmarlo te comprometes a usar la información solo para evaluar esta oportunidad.'}
        </p>
        <SignForm
          opportunityId={s.opportunity.id}
          accessRequestId={s.request.id}
          ndaText={s.ndaText}
          renewal={renewal}
        />
      </>
    );
  }

  if (st === 'NDA_SIGNED') {
    return (
      <>
        <div className="flex items-start gap-3">
          <Hourglass aria-hidden="true" className="mt-1 size-6 shrink-0 text-ld-primary" />
          <div>
            <h2 className="ld-h2">Esperando la autorización del vendedor</h2>
            <p className="mt-1.5 max-w-prose text-ld-ink">
              Firmaste el acuerdo. El vendedor revisa tu solicitud y te avisaremos por correo y en
              La Dorada cuando decida. Suele tomar de 1 a 3 días hábiles.
            </p>
          </div>
        </div>
        {s.nda ? <SignatureSeal nda={s.nda} /> : null}
      </>
    );
  }

  if (st === 'AUTHORIZED') {
    return (
      <>
        <div className="flex items-start gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-1 size-6 shrink-0 text-[var(--ld-success)]"
          />
          <div>
            <h2 className="ld-h2">Tienes acceso al data room</h2>
            <p className="mt-1.5 max-w-prose text-ld-ink">
              El vendedor autorizó tu acceso. Cada documento que abras queda registrado con tu
              usuario.
            </p>
          </div>
        </div>
        {s.nda ? <SignatureSeal nda={s.nda} /> : null}
        <Link href={`${base}/data-room`} className="ld-btn ld-btn-primary mt-5 gap-2 sm:self-start">
          <FolderLock aria-hidden="true" className="size-4" />
          Abrir data room
        </Link>
      </>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <ShieldX aria-hidden="true" className="mt-1 size-6 shrink-0 text-[var(--ld-danger)]" />
      <div>
        <h2 className="ld-h2">
          {st === 'REJECTED' ? 'El vendedor no aprobó tu solicitud' : 'Tu acceso fue retirado'}
        </h2>
        <p className="mt-1.5 max-w-prose text-ld-ink">
          {st === 'REJECTED'
            ? 'Esta oportunidad no sigue para ti, pero hay otras empresas esperando compradores como tú.'
            : 'El data room de esta oportunidad ya no está disponible para ti. Si crees que es un error, escribe al equipo de La Dorada.'}
        </p>
        <Link href="/marketplace" className="ld-btn ld-btn-quiet mt-5">
          Explorar otras oportunidades
        </Link>
      </div>
    </div>
  );
}

const STATUS_CHIP = {
  REQUESTED: { tone: 'warning', label: 'Falta tu firma' },
  NDA_SIGNED: { tone: 'info', label: 'Esperando al vendedor' },
  AUTHORIZED: { tone: 'success', label: 'Con acceso' },
  REJECTED: { tone: 'danger', label: 'No aprobada' },
  REVOKED: { tone: 'danger', label: 'Acceso retirado' },
} as const;

export default async function AccessPage({ params }: Props) {
  const user = await requireUser('BUYER');
  const { id } = await params;
  let s: BuyerAccessState;
  try {
    s = await getAccessState(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const chip = s.request
    ? s.needsSignature && s.request.status === 'AUTHORIZED'
      ? ({ tone: 'warning', label: 'NDA vencido' } as const)
      : STATUS_CHIP[s.request.status]
    : null;

  return (
    <>
      <Link
        href={`/opportunities/${s.opportunity.id}`}
        className="ld-small mb-4 inline-flex items-center gap-1.5 font-semibold text-ld-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a la oportunidad
      </Link>

      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="ld-h1">{s.opportunity.title}</h1>
          <p className="mt-1 text-ld-muted">
            {s.opportunity.sectorLabel} | {s.opportunity.department} | {s.opportunity.typeLabel}
          </p>
        </div>
        {chip ? (
          <StatusChip tone={chip.tone} className="self-start whitespace-nowrap">
            {chip.label}
          </StatusChip>
        ) : null}
      </header>

      <Stepper steps={stepsOf(s)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section className="flex flex-col rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-7">
          <MainPanel s={s} />
        </section>

        <aside className="flex flex-col gap-4">
          {s.request ? (
            <section
              aria-labelledby="tu-solicitud"
              className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5"
            >
              <h2 id="tu-solicitud" className="ld-h3">
                Tu solicitud
              </h2>
              <p className="ld-note mt-0.5 text-ld-muted">
                Enviada el {formatDay(s.request.createdAt)}
              </p>
              <p className="ld-small mt-3 whitespace-pre-line text-ld-ink">{s.request.purpose}</p>
            </section>
          ) : null}
          <section
            aria-labelledby="que-se-abre"
            className="rounded-[var(--ld-radius-panel)] bg-ld-navy p-5 text-white"
          >
            <h2 id="que-se-abre" className="font-display text-lg font-semibold">
              Qué se abre con el acceso
            </h2>
            <p className="ld-small mt-2 text-white/85">
              Razón social, estados financieros, declaraciones tributarias, contratos, clientes y
              proveedores. La información solo se muestra con un acuerdo vigente y la autorización
              del vendedor.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
