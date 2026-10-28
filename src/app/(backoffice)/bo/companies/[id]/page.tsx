import type { Metadata } from 'next';
import { ChevronLeft, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Disclaimer } from '@/components/ld/disclaimer';
import { StatusChip } from '@/components/ld/status-chip';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { formatCOP } from '@/domain/money';
import { OPPORTUNITY_TYPE_LABELS } from '@/domain/opportunity';
import { SECTOR_LABELS } from '@/domain/sectors';
import { requireUser } from '@/server/auth/guard';
import {
  getOpportunityEvaluation,
  type OpportunityEvaluationDetail,
} from '@/server/services/opportunity-review';
import { FeedbackProvider } from '../../users/_components/feedback';
import { formatDateTime } from '../../users/_components/labels';
import { DecisionPanel } from '../_components/decision-panel';
import {
  BREAKDOWN_LABEL,
  OPP_DECISION_LABEL,
  OPP_STATUS_LABEL,
  OPP_STATUS_TONE,
  formatRange,
} from '../_components/labels';
import { MatrixItem } from '../_components/matrix-editor';

export const metadata: Metadata = { title: 'Evaluación de empresa' };

type PageProps = { params: Promise<{ id: string }> };

function Panel({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 md:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="ld-h3">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Bar({ percent, tone = 'primary' }: { percent: number; tone?: 'primary' | 'success' }) {
  return (
    <div
      aria-hidden="true"
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--ld-neutral-soft)]"
    >
      <div
        className={`h-full rounded-full ${tone === 'success' ? 'bg-[var(--ld-success)]' : 'bg-ld-primary'}`}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function Valuation({ d }: { d: OpportunityEvaluationDetail }) {
  const complete = d.information.required > 0 && d.information.delivered >= d.information.required;
  return (
    <Panel id="valoracion" title="Resultado de valoración">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--ld-radius-control)] border border-ld-border p-4">
          <p className="ld-small text-ld-muted">Rango estimado de referencia</p>
          {d.valuation ? (
            <>
              <p className="ld-num mt-1 font-display text-[1.5rem] font-bold leading-8 tracking-[-0.02em] text-ld-navy">
                {formatRange(d.valuation.low, d.valuation.high)}
              </p>
              <p className="ld-note mt-1 text-ld-muted">
                Calculado sobre {d.valuation.basis === 'EBITDA' ? 'EBITDA' : 'ingresos'} del último año
                con los múltiplos del sector.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-[1.25rem] font-bold leading-7 text-[var(--ld-warning-ink)]">
                Faltan estados financieros
              </p>
              <p className="ld-note mt-1 text-ld-muted">{d.financialsIssue}</p>
            </>
          )}
        </div>
        <div className="rounded-[var(--ld-radius-control)] border border-ld-border p-4">
          <p className="ld-small text-ld-muted">Calidad de información</p>
          <p className="ld-num mt-1 font-display text-[1.5rem] font-bold leading-8 tracking-[-0.02em] text-ld-navy">
            {d.information.percent} %
            <span className="ld-small ml-2 font-sans font-medium text-ld-muted">
              {d.information.delivered}/{d.information.required} carpetas
            </span>
          </p>
          <div className="mt-2">
            <Bar percent={d.information.percent} tone={complete ? 'success' : 'primary'} />
          </div>
          <ul className="ld-note mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ld-muted">
            {d.folders
              .filter((f) => f.required)
              .map((f) => (
                <li key={f.name} className={f.documents > 0 ? 'text-ld-ink' : 'text-[var(--ld-danger-ink)]'}>
                  {f.documents > 0 ? '✓' : '✗'} {f.name}
                  <span className="sr-only">{f.documents > 0 ? ' (con documentos)' : ' (vacía)'}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
      <Disclaimer className="mt-4" />
    </Panel>
  );
}

function Teaser({ d }: { d: OpportunityEvaluationDetail }) {
  const t = d.teaser;
  const sections = Object.entries(t.sections);
  return (
    <Panel
      id="teaser"
      title="Así lo verá el comprador"
      aside={
        <span className="ld-small inline-flex items-center gap-1.5 text-ld-muted">
          <EyeOff aria-hidden="true" className="size-4" />
          Sin razón social, NIT ni ciudad
        </span>
      }
    >
      <div className="rounded-[var(--ld-radius-control)] border border-dashed border-ld-border-strong bg-[var(--ld-neutral-soft)] p-4 md:p-5">
        <p className="ld-small text-ld-muted">
          {t.typeLabel} · {t.sectorLabel} · {t.department}
        </p>
        <h3 className="ld-h2 mt-1">{t.title}</h3>
        {t.evaluation ? (
          <p className="ld-num mt-2 font-semibold text-ld-navy">
            {formatRange(d.valuation?.low ?? 0n, d.valuation?.high ?? 0n)}
            <span className="ld-small ml-2 font-medium text-ld-muted">
              Score {t.evaluation.score}/100
            </span>
          </p>
        ) : null}
        {sections.length === 0 ? (
          <p className="ld-small mt-3 text-ld-muted">
            El vendedor no ha dejado secciones visibles en el teaser.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {sections.map(([key, s]) => (
              <div key={key} className="min-w-0">
                <h4 className="ld-small font-semibold text-ld-navy">{s.title}</h4>
                {s.text ? <p className="ld-small mt-1 max-w-[60ch]">{s.text}</p> : null}
                {s.fields.length > 0 ? (
                  <dl className="ld-small mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {s.fields.map((f) => (
                      <div key={f.label} className="contents">
                        <dt className="text-ld-muted">{f.label}</dt>
                        <dd className="font-medium text-ld-navy">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="ld-note mt-4 text-ld-muted">{t.evaluation?.disclaimer}</p>
      </div>
    </Panel>
  );
}

export default async function OpportunityEvaluationPage({ params }: PageProps) {
  const actor = await requireUser('BACKOFFICE');
  const { id } = await params;
  let d: OpportunityEvaluationDetail;
  try {
    d = await getOpportunityEvaluation(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ValidationError) notFound();
    throw err;
  }
  const { opportunity: o, company: c } = d;
  const editable = o.status === 'IN_REVIEW';
  const lastYear = d.financials[d.financials.length - 1];

  return (
    <FeedbackProvider>
      <Link
        href="/bo/companies"
        className="ld-small mb-4 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--ld-radius-nav)] px-2 font-semibold text-ld-primary hover:bg-ld-primary-soft"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Volver a evaluación de empresas
      </Link>

      {editable ? (
        <a href="#decision" className="ld-small mb-4 block font-semibold text-ld-primary lg:hidden">
          Ir a la decisión
        </a>
      ) : null}

      <header className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="ld-h1 break-words">{c.legalName}</h1>
          <StatusChip tone={OPP_STATUS_TONE[o.status]}>{OPP_STATUS_LABEL[o.status]}</StatusChip>
        </div>
        <p className="text-ld-muted">
          <span className="ld-num">NIT {c.nit}</span> · {SECTOR_LABELS[c.sector]} · {c.city},{' '}
          {c.department} · {OPPORTUNITY_TYPE_LABELS[o.type].label}
        </p>
        <p className="ld-small break-words text-ld-muted">
          Publicada como «{o.title}» por {o.sellerName}
          {o.publishedAt ? ` · publicada el ${formatDateTime(o.publishedAt)}` : ''}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          <Valuation d={d} />

          <Panel id="matriz" title="Matriz de evaluación">
            {editable ? (
              <p className="ld-small mb-1 text-ld-muted">
                Cada cambio se guarda al instante y recalcula la valoración y el score.
              </p>
            ) : null}
            <ul>
              {d.matrix.map((m) => (
                <MatrixItem
                  key={`${m.kind}-${m.status ?? 'none'}-${m.notes ?? ''}`}
                  opportunityId={o.id}
                  {...m}
                  editable={editable}
                />
              ))}
            </ul>
          </Panel>

          <Panel id="score" title="Score">
            <div className="grid gap-6 md:grid-cols-[8rem_minmax(0,1fr)] md:items-center">
              <p className="ld-num font-display text-[3rem] font-bold leading-none tracking-[-0.02em] text-ld-navy">
                {d.score.total}
                <span className="ld-small ml-1 font-sans font-medium text-ld-muted">/ 100</span>
              </p>
              <ul className="flex flex-col gap-2.5">
                {Object.entries(d.score.breakdown).map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] sm:grid-cols-[11rem_minmax(0,1fr)_2.5rem] items-center gap-3">
                    <span className="ld-small text-ld-ink">{BREAKDOWN_LABEL[k] ?? k}</span>
                    <Bar percent={v} />
                    <span className="ld-small ld-num text-right font-semibold text-ld-navy">
                      {Math.round(v)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Teaser d={d} />

          <Panel id="empresa" title="Datos de la empresa">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {(
                [
                  ['Razón social', c.legalName],
                  ['NIT', c.nit],
                  ['Sector', `${SECTOR_LABELS[c.sector]}${c.subsector ? ` · ${c.subsector}` : ''}`],
                  ['Ubicación', `${c.city}, ${c.department}`],
                  ['Año de fundación', c.foundedYear ? String(c.foundedYear) : null],
                  ['Empleados', c.employeesRange],
                  ['Canales', c.channels.length > 0 ? c.channels.join(', ') : null],
                  ['Capacidad', c.capacity],
                  ['Objetivo', o.objective],
                  ['Horizonte', o.horizon],
                  [
                    'Tamaño de la transacción',
                    o.dealSizeMin !== null
                      ? `${formatCOP(o.dealSizeMin)}${o.dealSizeMax !== null ? ` a ${formatCOP(o.dealSizeMax)}` : ' o más'}`
                      : null,
                  ],
                ] as [string, string | null][]
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="ld-small text-ld-muted">{k}</dt>
                    <dd className="break-words font-medium text-ld-navy">{v}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-4 max-w-[68ch]">{c.description}</p>

            <h3 className="ld-small mb-2 mt-6 font-semibold text-ld-navy">Estados financieros</h3>
            {d.financials.length === 0 ? (
              <p className="ld-small text-ld-muted">El vendedor aún no registra estados financieros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ld-small w-full min-w-[28rem] border-collapse text-left">
                  <caption className="sr-only">Estados financieros por año</caption>
                  <thead>
                    <tr className="border-b border-ld-border text-ld-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">Año</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Ingresos</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">EBITDA</th>
                      <th scope="col" className="py-2 text-right font-medium">Utilidad neta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.financials.map((y) => (
                      <tr
                        key={y.year}
                        className={`border-b border-ld-border last:border-b-0 ${
                          y.year === lastYear?.year ? 'font-semibold text-ld-navy' : ''
                        }`}
                      >
                        <th scope="row" className="ld-num py-2 pr-3 font-medium">{y.year}</th>
                        <td className="ld-num py-2 pr-3 text-right">{formatCOP(y.revenue)}</td>
                        <td className="ld-num py-2 pr-3 text-right">{formatCOP(y.ebitda)}</td>
                        <td className="ld-num py-2 text-right">{formatCOP(y.netIncome)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel id="decisiones" title="Historial de decisiones">
            {d.decisions.length === 0 ? (
              <p>Aún no hay decisiones registradas.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {d.decisions.map((x, i) => (
                  <li
                    key={`${x.at.toISOString()}-${i}`}
                    className="border-l-2 border-ld-border py-1 pl-4"
                  >
                    <p className="ld-small text-ld-muted">
                      <time dateTime={x.at.toISOString()} className="ld-num">
                        {formatDateTime(x.at)}
                      </time>
                      {' · '}
                      <span className="font-semibold text-ld-navy">
                        {OPP_DECISION_LABEL[x.kind] ?? x.kind}
                      </span>
                      {x.actorName ? ` por ${x.actorName}` : ''}
                    </p>
                    {x.text ? <p className="mt-1 max-w-[68ch] whitespace-pre-line">{x.text}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <aside
          aria-labelledby="decision"
          className="rounded-[var(--ld-radius-panel)] border border-ld-border bg-ld-surface p-5 lg:sticky lg:top-6 lg:order-2"
        >
          <h2 id="decision" className="ld-h3 mb-3">
            Decisión
          </h2>
          <DecisionPanel
            opportunityId={o.id}
            title={o.title}
            status={o.status}
            blockers={d.blockers}
          />
        </aside>
      </div>
    </FeedbackProvider>
  );
}
