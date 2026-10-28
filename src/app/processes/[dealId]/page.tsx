import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CircleCheck, CircleDashed, Eye, FileText } from 'lucide-react';
import { Disclaimer } from '@/components/ld/disclaimer';
import { StatusChip, type ChipTone } from '@/components/ld/status-chip';
import { DEAL_STATUS_LABELS, type DealStage } from '@/domain/deal';
import { NotFoundError } from '@/domain/errors';
import type { DealStatus } from '@/domain/machines/deal';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { requireUser } from '@/server/auth/guard';
import {
  getDeal,
  OFFER_STATUS_LABELS,
  type DealView,
  type OfferView,
} from '@/server/services/deal';
import { DealActions } from '../_components/deal-actions';
import { buildSteps, DealStepper } from '../_components/deal-stepper';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ dealId: string }> };

async function load(dealId: string): Promise<DealView> {
  const user = await requireUser('BUYER', 'SELLER', 'BACKOFFICE');
  try {
    return await getDeal(user, dealId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { dealId } = await params;
  const d = await load(dealId);
  return { title: `Proceso: ${d.opportunity.title}` };
}

const STATUS_TONE: Record<DealStatus, ChipTone> = {
  OFFER_SENT: 'info',
  COUNTER_OFFER: 'info',
  PRELIMINARY_AGREEMENT: 'warning',
  LOI_SIGNED: 'info',
  DUE_DILIGENCE: 'info',
  CLOSED: 'success',
  WITHDRAWN: 'neutral',
};

const OFFER_TONE: Record<OfferView['status'], ChipTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  COUNTERED: 'neutral',
  WITHDRAWN: 'neutral',
  EXPIRED: 'neutral',
};

const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;

/** "Tu oferta", "Contraoferta del vendedor"… relative to who is looking. */
function offerTitle(d: DealView, o: OfferView): string {
  const first = d.offers.at(-1)?.id === o.id;
  const noun = first ? 'oferta' : 'contraoferta';
  if (o.author === d.viewer) return `Tu ${noun}`;
  const who = o.author === 'BUYER' ? 'del comprador' : 'del vendedor';
  return `${first ? 'Oferta' : 'Contraoferta'} ${who}`;
}

/** What happens now, in the viewer's words. */
function nextStep(d: DealView): { title: string; body: string } {
  const me = d.viewer;
  const other = me === 'BUYER' ? 'el vendedor' : 'el comprador';
  const pendingFrom = d.offers.find((o) => o.status === 'PENDING')?.author ?? null;
  if (me === 'BACKOFFICE') {
    return {
      title: 'Vista de solo lectura',
      body: 'Las partes conducen la negociación. El Back Office puede revisar el proceso, pero no modificarlo.',
    };
  }
  switch (d.status) {
    case 'OFFER_SENT':
    case 'COUNTER_OFFER':
      return pendingFrom === me
        ? {
            title: `Esperando a ${other}`,
            body: `Enviaste tu propuesta. ${other === 'el vendedor' ? 'El vendedor' : 'El comprador'} puede aceptarla o responder con una contraoferta.`,
          }
        : {
            title: 'Te toca responder',
            body: 'Revisa los términos. Puedes aceptarlos o proponer otros con una contraoferta.',
          };
    case 'PRELIMINARY_AGREEMENT': {
      const mine = me === 'BUYER' ? d.loi?.buyerSignedAt : d.loi?.sellerSignedAt;
      return mine
        ? {
            title: `Esperando la firma de ${other}`,
            body: 'Ya firmaste la carta de intención. Cuando la otra parte firme, pasan a due diligence.',
          }
        : {
            title: 'Firma la carta de intención',
            body: 'Hay acuerdo en los términos. Lee la carta de intención y fírmala para continuar.',
          };
    }
    case 'LOI_SIGNED':
      return {
        title: 'Carta firmada por ambas partes',
        body: 'Cuando estén listos para revisar la empresa a fondo, cualquiera de las partes inicia la due diligence.',
      };
    case 'DUE_DILIGENCE': {
      const mine = me === 'BUYER' ? d.close.buyerConfirmedAt : d.close.sellerConfirmedAt;
      return mine
        ? {
            title: `Esperando a ${other}`,
            body: 'Confirmaste el cierre. El proceso se cierra cuando la otra parte también confirme.',
          }
        : {
            title: 'Due diligence en curso',
            body: 'Cuando terminen la revisión y estén de acuerdo, cada parte confirma el cierre.',
          };
    }
    case 'CLOSED':
      return {
        title: 'Transacción cerrada',
        body: 'Ambas partes confirmaron el cierre. La oportunidad ya no aparece en el marketplace.',
      };
    case 'WITHDRAWN':
      return {
        title: 'Proceso terminado',
        body: 'Una de las partes desistió. Las ofertas pendientes quedaron retiradas.',
      };
  }
}

function reachedStage(d: DealView): DealStage {
  if (d.status !== 'WITHDRAWN') return d.stage;
  if (d.milestones.loiSignedAt) return 'DUE_DILIGENCE';
  if (d.loi) return 'LOI';
  return d.offers.length > 1 ? 'NEGOTIATION' : 'OFFER';
}

export default async function DealPage({ params }: Props) {
  const { dealId } = await params;
  const d = await load(dealId);
  const step = nextStep(d);
  const party = d.viewer === 'BACKOFFICE' ? null : d.viewer;
  const closedAt =
    d.close.buyerConfirmedAt && d.close.sellerConfirmedAt
      ? new Date(Math.max(d.close.buyerConfirmedAt.getTime(), d.close.sellerConfirmedAt.getTime()))
      : null;
  const steps = buildSteps({
    reached: reachedStage(d),
    closed: d.status === 'CLOSED',
    withdrawn: d.status === 'WITHDRAWN',
    dates: {
      CONTACT: d.milestones.contactAt,
      NDA_SIGNED: d.milestones.ndaSignedAt,
      OFFER: d.milestones.firstOfferAt,
      LOI: d.milestones.loiSignedAt,
      CLOSING: closedAt,
    },
  });
  const back =
    d.viewer === 'BUYER'
      ? { href: `/opportunities/${d.opportunity.id}`, label: 'Volver a la oportunidad' }
      : d.viewer === 'SELLER'
        ? { href: '/seller/processes', label: 'Volver a mis procesos' }
        : { href: '/bo', label: 'Volver al inicio' };
  const c = d.current;

  return (
    <>
      <Link
        href={back.href}
        className="ld-small mb-4 inline-flex items-center gap-1.5 font-semibold text-ld-primary hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="ld-h1">{d.opportunity.title}</h1>
          <p className="mt-1 text-ld-muted">
            {d.opportunity.sectorLabel} | {d.opportunity.department} | {d.opportunity.typeLabel}
          </p>
          {d.viewer !== 'BUYER' ? (
            <p className="ld-small mt-1 text-ld-ink">
              Comprador: <span className="font-semibold text-ld-navy">{d.buyerName}</span>
            </p>
          ) : null}
        </div>
        <StatusChip tone={STATUS_TONE[d.status]} className="mt-1">
          {DEAL_STATUS_LABELS[d.status]}
        </StatusChip>
      </header>

      <DealStepper steps={steps} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-6">
          {c ? (
            <section
              aria-labelledby="sec-oferta"
              className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 id="sec-oferta" className="ld-h2">
                    Oferta actual
                  </h2>
                  <p className="ld-small text-ld-muted">
                    {offerTitle(d, c)}, enviada el {formatDay(c.createdAt)}
                  </p>
                </div>
                <StatusChip tone={OFFER_TONE[c.status]}>{OFFER_STATUS_LABELS[c.status]}</StatusChip>
              </div>

              <div className="grid gap-4 border-b border-ld-border pb-5 sm:grid-cols-2">
                <div>
                  <p className="ld-note text-ld-muted">Valor de la empresa (pre-money)</p>
                  <p className="ld-num mt-0.5 font-display text-[1.75rem] font-bold leading-9 tracking-[-0.02em] text-ld-navy md:text-[2rem] md:leading-10">
                    {c.preMoneyLabel}
                  </p>
                </div>
                <div>
                  <p className="ld-note text-ld-muted">Participación a adquirir</p>
                  <p className="ld-num mt-0.5 font-display text-[1.75rem] font-bold leading-9 tracking-[-0.02em] text-ld-navy md:text-[2rem] md:leading-10">
                    {pct(c.stakePct)}
                  </p>
                </div>
              </div>

              <dl className="grid gap-x-8 gap-y-4 pt-5 sm:grid-cols-2">
                <div>
                  <dt className="ld-note text-ld-muted">Tipo de inversión</dt>
                  <dd className="mt-0.5 font-semibold text-ld-navy">{c.investmentType}</dd>
                </div>
                <div>
                  <dt className="ld-note text-ld-muted">Esquema de pago</dt>
                  <dd className="mt-0.5 font-semibold text-ld-navy">{c.paymentScheme}</dd>
                </div>
                <div>
                  <dt className="ld-note text-ld-muted">Exclusividad</dt>
                  <dd className="ld-num mt-0.5 font-semibold text-ld-navy">
                    {c.exclusivityDays} días
                  </dd>
                </div>
                <div>
                  <dt className="ld-note text-ld-muted">Validez de la oferta</dt>
                  <dd className="ld-num mt-0.5 font-semibold text-ld-navy">
                    Hasta el {formatDay(c.validUntil)}
                  </dd>
                </div>
              </dl>

              <Disclaimer className="mt-5">
                Términos propuestos entre las partes. La Dorada no fija ni recomienda precios. No es
                asesoría financiera regulada ni obliga a comprar o vender.
              </Disclaimer>
            </section>
          ) : null}

          {d.loi ? <LoiCard d={d} /> : null}

          <section
            aria-labelledby="sec-historial"
            className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6"
          >
            <h2 id="sec-historial" className="ld-h2 mb-4">
              Historial de ofertas
            </h2>
            <ol className="flex flex-col">
              {d.offers.map((o, i) => (
                <li
                  key={o.id}
                  className={cn(
                    'relative flex gap-4 pb-5 pl-1 last:pb-0',
                    i < d.offers.length - 1 &&
                      'before:absolute before:bottom-0 before:left-[0.6875rem] before:top-6 before:w-px before:bg-ld-border',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1.5 size-3.5 shrink-0 rounded-full border-2',
                      o.author === 'BUYER'
                        ? 'border-ld-primary bg-ld-primary-soft'
                        : 'border-[var(--ld-gold)] bg-[#fff6dd]',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="font-semibold text-ld-navy">{offerTitle(d, o)}</p>
                      <p className="ld-note ld-num text-ld-muted">{formatDay(o.createdAt)}</p>
                    </div>
                    <p className="ld-num mt-0.5 text-ld-ink">
                      {o.preMoneyLabel} por el {pct(o.stakePct)}
                    </p>
                    <p className="ld-small text-ld-muted">
                      {o.paymentScheme}. Exclusividad de {o.exclusivityDays} días.
                    </p>
                    <StatusChip tone={OFFER_TONE[o.status]} className="mt-2">
                      {OFFER_STATUS_LABELS[o.status]}
                    </StatusChip>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="order-first flex flex-col gap-4 lg:sticky lg:top-6 lg:order-none">
          <section
            aria-labelledby="sec-paso"
            className={cn(
              'rounded-[var(--ld-radius-panel)] border bg-ld-surface p-5',
              d.actions.some((a) => a !== 'WITHDRAW')
                ? 'border-ld-primary shadow-[0_0_0_3px_var(--ld-primary-soft)]'
                : 'border-ld-border-strong',
            )}
          >
            <h2 id="sec-paso" className="ld-h3 flex items-center gap-2">
              {d.viewer === 'BACKOFFICE' ? (
                <Eye aria-hidden="true" className="size-5 text-ld-muted" />
              ) : null}
              {step.title}
            </h2>
            <p className="ld-small mb-4 mt-1.5 text-ld-ink">{step.body}</p>
            {party && d.actions.length > 0 ? (
              <DealActions
                dealId={d.id}
                opportunityId={d.opportunity.id}
                party={party}
                actions={d.actions}
                counterDefaults={
                  c
                    ? {
                        preMoneyMillions: c.preMoneyMillions,
                        stakePct: c.stakePct,
                        investmentType: c.investmentType,
                        paymentScheme: c.paymentScheme,
                        exclusivityDays: c.exclusivityDays,
                      }
                    : null
                }
              />
            ) : null}
          </section>

          {d.status === 'DUE_DILIGENCE' || d.status === 'CLOSED' ? (
            <section
              aria-labelledby="sec-cierre"
              className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5"
            >
              <h2 id="sec-cierre" className="ld-h3 mb-3">
                Confirmación de cierre
              </h2>
              <Signatures
                buyerAt={d.close.buyerConfirmedAt}
                sellerAt={d.close.sellerConfirmedAt}
                viewer={d.viewer}
                doneLabel="Confirmó"
              />
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Signatures({
  buyerAt,
  sellerAt,
  viewer,
  doneLabel,
}: {
  buyerAt: Date | null;
  sellerAt: Date | null;
  viewer: DealView['viewer'];
  doneLabel: string;
}) {
  const rows = [
    { who: viewer === 'BUYER' ? 'Tú (comprador)' : 'Comprador', at: buyerAt },
    { who: viewer === 'SELLER' ? 'Tú (vendedor)' : 'Vendedor', at: sellerAt },
  ];
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.who} className="flex items-center gap-2.5">
          {r.at ? (
            <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-[var(--ld-success)]" />
          ) : (
            <CircleDashed aria-hidden="true" className="size-5 shrink-0 text-ld-border-strong" />
          )}
          <span className="flex-1 font-semibold text-ld-navy">{r.who}</span>
          <span className={cn('ld-small ld-num', r.at ? 'text-ld-ink' : 'text-ld-muted')}>
            {r.at ? `${doneLabel} el ${formatDay(r.at)}` : 'Pendiente'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LoiCard({ d }: { d: DealView }) {
  const loi = d.loi!;
  const both = Boolean(loi.buyerSignedAt && loi.sellerSignedAt);
  const [title, ...paragraphs] = loi.text.split('\n\n');
  return (
    <section
      aria-labelledby="sec-loi"
      className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="sec-loi" className="ld-h2">
          Carta de intención (LOI)
        </h2>
        <StatusChip tone={both ? 'success' : 'warning'}>
          {both ? 'Firmada por ambas partes' : 'Pendiente de firmas'}
        </StatusChip>
      </div>
      <Signatures
        buyerAt={loi.buyerSignedAt}
        sellerAt={loi.sellerSignedAt}
        viewer={d.viewer}
        doneLabel="Firmó"
      />
      <details className="group mt-5 rounded-[var(--ld-radius-control)] border border-ld-border-strong bg-[var(--ld-bg)]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 font-semibold text-ld-navy [&::-webkit-details-marker]:hidden">
          <FileText aria-hidden="true" className="size-5 shrink-0 text-ld-primary" />
          <span className="flex-1">Leer la carta de intención</span>
          <span className="ld-note text-ld-muted group-open:hidden">Mostrar</span>
          <span className="ld-note hidden text-ld-muted group-open:inline">Ocultar</span>
        </summary>
        <div
          tabIndex={0}
          role="document"
          aria-label="Texto de la carta de intención"
          className="max-h-[24rem] overflow-y-auto border-t border-ld-border px-5 py-5 md:px-7"
        >
          <p className="font-display text-base font-semibold text-ld-navy">{title}</p>
          {paragraphs.map((p, i) => (
            <p
              key={i}
              className="ld-small mt-3 max-w-prose whitespace-pre-line leading-6 text-ld-ink"
            >
              {p}
            </p>
          ))}
        </div>
      </details>
      <p className="ld-note mt-3 break-all text-ld-muted">
        Huella del documento (SHA-256): {loi.documentHash}
      </p>
    </section>
  );
}
