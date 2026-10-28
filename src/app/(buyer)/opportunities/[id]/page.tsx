import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, FolderLock, Lock } from 'lucide-react';
import { Disclaimer } from '@/components/ld/disclaimer';
import { TeaserImage } from '@/components/ld/opportunity-card';
import { StatusChip } from '@/components/ld/status-chip';
import { NotFoundError } from '@/domain/errors';
import { TEASER_SECTIONS } from '@/domain/visibility';
import { requireUser } from '@/server/auth/guard';
import { activeDealId } from '@/server/services/deal';
import { getTeaser, type TeaserDetail } from '@/server/services/marketplace';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function load(id: string): Promise<TeaserDetail & { activeDealId: string | null }> {
  const user = await requireUser('BUYER');
  try {
    const t = await getTeaser(user, id);
    return { ...t, activeDealId: await activeDealId(user.id, t.id) };
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await load(id);
  return { title: t.title };
}

export default async function TeaserPage({ params }: Props) {
  const { id } = await params;
  const t = await load(id);
  const sections = TEASER_SECTIONS.flatMap((k) => (t.sections[k] ? [t.sections[k]] : []));

  return (
    <>
      <Link
        href="/marketplace"
        className="ld-small mb-4 inline-flex items-center gap-1.5 font-semibold text-ld-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al marketplace
      </Link>

      <header className="relative mb-8 overflow-hidden rounded-[var(--ld-radius-panel)] bg-ld-navy">
        <TeaserImage
          teaser={t}
          className="h-56 w-full object-cover object-[50%_30%] opacity-90 md:h-72"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b2a6b] via-[#0b2a6b]/50 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8">
          <StatusChip tone="info" className="mb-3">
            {t.typeLabel}
          </StatusChip>
          <h1 className="font-display text-[1.75rem] font-bold leading-9 tracking-[-0.02em] text-white md:text-[2.5rem] md:leading-[3rem]">
            {t.title}
          </h1>
          <p className="mt-1 text-base text-white/85">
            {t.sectorLabel} | {t.department}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-8">
          {sections.map((s) => (
            <section key={s.title} aria-labelledby={`sec-${s.title}`}>
              <h2 id={`sec-${s.title}`} className="ld-h2 mb-3">
                {s.title}
              </h2>
              {s.text ? <p className="max-w-prose text-ld-ink">{s.text}</p> : null}
              {s.fields.length > 0 ? (
                <dl className="mt-4 grid gap-x-8 gap-y-4 border-t border-ld-border pt-4 sm:grid-cols-2">
                  {s.fields.map((f) => (
                    <div key={f.label}>
                      <dt className="ld-note text-ld-muted">{f.label}</dt>
                      <dd className="ld-num mt-0.5 font-semibold text-ld-navy">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ))}

          {t.evaluation ? (
            <section
              aria-labelledby="sec-valoracion"
              className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6"
            >
              <h2 id="sec-valoracion" className="ld-h2 mb-4">
                Valoración de referencia
              </h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="ld-note text-ld-muted">Rango estimado</p>
                  <p className="ld-num mt-1 font-display text-[1.375rem] font-bold leading-8 tracking-[-0.02em] text-ld-navy">
                    {t.evaluation.valuationLow} – {t.evaluation.valuationHigh}
                  </p>
                </div>
                <div>
                  <p className="ld-note text-ld-muted">Puntuación La Dorada</p>
                  <p className="ld-num mt-1 font-display text-[1.375rem] font-bold leading-8 tracking-[-0.02em] text-ld-navy">
                    {t.evaluation.score}
                    <span className="text-base font-medium text-ld-muted"> / 100</span>
                  </p>
                </div>
              </div>
              <Disclaimer className="mt-5">{t.evaluation.disclaimer}</Disclaimer>
            </section>
          ) : null}
        </div>

        <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none">
          <AccessPanel t={t} />
          <section
            aria-labelledby="sec-publico"
            className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5"
          >
            <h2 id="sec-publico" className="ld-h3 mb-3">
              Qué es público y qué es confidencial
            </h2>
            <ul className="flex flex-col gap-3 text-ld-ink">
              <li className="flex gap-2.5">
                <Eye aria-hidden="true" className="mt-1 size-4 shrink-0 text-ld-primary" />
                <span className="ld-small">
                  <strong className="text-ld-navy">Público:</strong> el resumen, el negocio y las
                  cifras en rangos. Es lo que ves aquí.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Lock aria-hidden="true" className="mt-1 size-4 shrink-0 text-ld-primary" />
                <span className="ld-small">
                  <strong className="text-ld-navy">Confidencial:</strong> razón social, NIT,
                  ubicación exacta, estados financieros, contratos y accionistas.
                </span>
              </li>
              <li className="flex gap-2.5">
                <FolderLock aria-hidden="true" className="mt-1 size-4 shrink-0 text-ld-primary" />
                <span className="ld-small">
                  Se abre en el data room cuando firmas el acuerdo de confidencialidad y el vendedor
                  autoriza tu acceso.
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function AccessPanel({ t }: { t: TeaserDetail & { activeDealId: string | null } }) {
  const { status, canOpenDataRoom } = t.access;
  const base = `/opportunities/${t.id}`;
  let title = 'Solicita acceso';
  let body = 'Pide acceso para conocer la empresa. Primero firmas un acuerdo de confidencialidad.';
  let action: React.ReactNode = (
    <Link href={`${base}/acceso`} className="ld-btn ld-btn-primary w-full">
      Solicitar acceso
    </Link>
  );

  if (status === 'REQUESTED') {
    title = 'Falta tu firma';
    body = 'Tu solicitud está registrada. Firma el acuerdo de confidencialidad para continuar.';
    action = (
      <Link href={`${base}/acceso`} className="ld-btn ld-btn-primary w-full">
        Firmar acuerdo de confidencialidad
      </Link>
    );
  } else if (status === 'NDA_SIGNED') {
    title = 'Esperando al vendedor';
    body = 'Ya firmaste el acuerdo. El vendedor revisa tu solicitud y te avisaremos su decisión.';
    action = (
      <button type="button" disabled className="ld-btn ld-btn-primary w-full">
        Esperando autorización del vendedor
      </button>
    );
  } else if (status === 'AUTHORIZED' && canOpenDataRoom) {
    title = 'Tienes acceso';
    body = t.activeDealId
      ? 'Tienes un proceso de negociación abierto con el vendedor.'
      : 'El vendedor autorizó tu acceso. Revisa los documentos y, cuando estés listo, haz una oferta.';
    action = (
      <div className="flex flex-col gap-2">
        {t.activeDealId ? (
          <Link href={`/processes/${t.activeDealId}`} className="ld-btn ld-btn-primary w-full">
            Ver proceso
          </Link>
        ) : (
          <Link href={`${base}/oferta`} className="ld-btn ld-btn-primary w-full">
            Hacer una oferta
          </Link>
        )}
        <Link href={`${base}/data-room`} className="ld-btn ld-btn-quiet w-full">
          Abrir data room
        </Link>
        {!t.activeDealId && t.dealId ? (
          <Link
            href={`/processes/${t.dealId}`}
            className="ld-small self-center font-semibold text-ld-primary hover:underline"
          >
            Ver proceso anterior
          </Link>
        ) : null}
      </div>
    );
  } else if (status === 'AUTHORIZED') {
    title = 'Tu acuerdo venció';
    body =
      'Tu acuerdo de confidencialidad ya no está vigente. Firma uno nuevo para recuperar el acceso.';
    action = (
      <Link href={`${base}/acceso`} className="ld-btn ld-btn-primary w-full">
        Firmar acuerdo de confidencialidad
      </Link>
    );
  } else if (status === 'REJECTED') {
    title = 'Solicitud no aprobada';
    body = 'El vendedor no aprobó esta solicitud. Puedes seguir explorando otras oportunidades.';
    action = null;
  } else if (status === 'REVOKED') {
    title = 'Acceso revocado';
    body = 'El vendedor retiró tu acceso a esta oportunidad. Puedes seguir explorando otras.';
    action = null;
  }

  return (
    <section
      aria-labelledby="sec-acceso"
      className="rounded-[var(--ld-radius-panel)] border border-ld-border-strong bg-ld-surface p-5"
    >
      <h2 id="sec-acceso" className="ld-h3">
        {title}
      </h2>
      <p className="ld-small mb-4 mt-1.5 text-ld-ink">{body}</p>
      {action}
    </section>
  );
}
