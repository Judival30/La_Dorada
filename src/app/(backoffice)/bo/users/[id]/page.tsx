import type { Metadata } from 'next';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusChip } from '@/components/ld/status-chip';
import { NotFoundError, ValidationError } from '@/domain/errors';
import { DOCUMENT_LABELS } from '@/domain/onboarding';
import { SECTOR_LABELS } from '@/domain/sectors';
import { requireUser } from '@/server/auth/guard';
import {
  SCREENING_ITEM_PREFIX,
  getUserReview,
  type UserReviewDetail,
} from '@/server/services/user-review';
import { DecisionPanel } from '../_components/decision-panel';
import { FeedbackProvider } from '../_components/feedback';
import { KycChecklist } from '../_components/kyc-checklist';
import {
  ROLE_NAME,
  STATUS_LABEL,
  STATUS_TONE,
  actionLabel,
  formatDateTime,
  initialsOf,
} from '../_components/labels';
import { ReviewDocuments } from '../_components/review-documents';

export const metadata: Metadata = { title: 'Revisión de usuario' };

type PageProps = { params: Promise<{ id: string }> };

const BUYER_TYPE_LABEL = {
  FUND: 'Fondo de inversión',
  STRATEGIC: 'Empresa estratégica',
  FAMILY_OFFICE: 'Family office',
  ANGEL: 'Inversionista a título personal',
} as const;

function formatPhone(value: string): string {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(value);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : value;
}

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

function profileRows(detail: UserReviewDetail): [string, string][] {
  const { user, case: c } = detail;
  const rows: [string, string][] = [['Correo', user.email]];
  const p = c?.profile;
  const phone = p?.step1?.phone ?? user.phone;
  if (phone) rows.push(['Celular', formatPhone(phone)]);
  if (p?.step1?.position) rows.push(['Cargo', p.step1.position]);
  const s3 = p?.step3;
  if (user.role === 'SELLER') {
    if (c?.isLegalRepresentative !== null && c?.isLegalRepresentative !== undefined) {
      rows.push([
        'Representación',
        c.isLegalRepresentative ? 'Es el representante legal' : 'Actúa con un poder o autorización',
      ]);
    }
  } else if (c?.buyerType) {
    rows.push(['Tipo de comprador', BUYER_TYPE_LABEL[c.buyerType]]);
    if (s3 && 'entityName' in s3 && s3.entityName) rows.push(['Entidad', s3.entityName]);
    if (s3 && 'entityNit' in s3 && s3.entityNit) rows.push(['NIT de la entidad', s3.entityNit]);
  }
  const s4 = p?.step4;
  if (s4 && 'legalName' in s4) {
    rows.push(['Razón social', s4.legalName], ['NIT', s4.nit]);
    rows.push(['Sector', SECTOR_LABELS[s4.sector]]);
    rows.push(['Ubicación', `${s4.city}, ${s4.department}`]);
  } else if (s4 && 'sectors' in s4) {
    rows.push(['Sectores de interés', s4.sectors.map((s) => SECTOR_LABELS[s]).join(', ')]);
    rows.push(['Regiones de interés', s4.regions.join(', ')]);
    const fmt = (n: number) => n.toLocaleString('es-CO');
    rows.push(['Ticket', `COP ${fmt(s4.ticketMinMillions)} M a COP ${fmt(s4.ticketMaxMillions)} M`]);
  }
  rows.push([
    'Consentimiento de datos',
    user.consentAt ? `Aceptado el ${formatDateTime(user.consentAt)}` : 'Sin registro',
  ]);
  return rows;
}

/** Same rule as `decideUser`: every KYC item done and every required document APPROVED. */
function missingForApproval(detail: UserReviewDetail): string[] {
  const missing: string[] = [];
  for (const item of detail.checklist) {
    if (!item.done) missing.push(`Completar en el checklist: ${item.label}`);
  }
  for (const type of detail.requiredDocuments) {
    if (!detail.documents.some((d) => d.type === type && d.reviewStatus === 'APPROVED')) {
      missing.push(`Aprobar el documento: ${DOCUMENT_LABELS[type]}`);
    }
  }
  return missing;
}

export default async function UserReviewPage({ params }: PageProps) {
  const actor = await requireUser('BACKOFFICE');
  const { id } = await params;
  let detail: UserReviewDetail;
  try {
    detail = await getUserReview(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ValidationError) notFound();
    throw err;
  }
  const { user, case: c } = detail;
  const canReview = user.status === 'IN_REVIEW';
  const selfReview = actor.id === user.id;
  const missing = missingForApproval(detail);
  const rows = profileRows(detail);

  return (
    <FeedbackProvider>
      <Link
        href="/bo/users"
        className="ld-small mb-4 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--ld-radius-nav)] px-2 font-semibold text-ld-primary hover:bg-ld-primary-soft"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Volver a validación de usuarios
      </Link>

      {canReview && !selfReview ? (
        <a href="#decision" className="ld-small mb-4 block font-semibold text-ld-primary lg:hidden">
          Ir a la decisión
        </a>
      ) : null}

      <header className="mb-6 flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-ld-navy font-display text-lg font-bold text-white"
        >
          {initialsOf(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="ld-h1 break-words">{user.name}</h1>
          <p className="mt-1 text-ld-muted">
            {ROLE_NAME[user.role]}
            {user.organizationName ? ` en ${user.organizationName}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_TONE[user.status]}>{STATUS_LABEL[user.status]}</StatusChip>
            {c?.submittedAt ? (
              <span className="ld-small text-ld-muted">
                Envió su registro el {formatDateTime(c.submittedAt)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:order-1">
          {c?.correctionNotes && user.status === 'CORRECTIONS_REQUESTED' ? (
            <Panel id="notas" title="Correcciones solicitadas">
              <p className="max-w-[68ch] whitespace-pre-line">{c.correctionNotes}</p>
            </Panel>
          ) : null}
          {c?.rejectionReason && user.status === 'REJECTED' ? (
            <Panel id="motivo" title="Motivo del rechazo">
              <p className="max-w-[68ch] whitespace-pre-line">{c.rejectionReason}</p>
            </Panel>
          ) : null}

          <Panel id="perfil" title="Datos del registro">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {rows.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="ld-small text-ld-muted">{k}</dt>
                  <dd className="break-words font-medium text-ld-navy">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel id="documentos" title="Documentos">
            <ReviewDocuments
              userId={user.id}
              documents={detail.documents}
              required={detail.requiredDocuments.map((type) => ({
                type,
                label: DOCUMENT_LABELS[type],
              }))}
              canReview={canReview && !selfReview}
            />
          </Panel>

          <Panel id="kyc" title="Checklist KYC">
            <KycChecklist
              userId={user.id}
              items={detail.checklist.map((i) => ({
                ...i,
                screening: i.label.startsWith(SCREENING_ITEM_PREFIX),
              }))}
              canReview={canReview && !selfReview}
            />
          </Panel>

          <Panel id="historial" title="Historial">
            {detail.history.length === 0 ? (
              <p>Aún no hay actividad registrada.</p>
            ) : (
              <ol className="flex flex-col">
                {detail.history.map((h, i) => (
                  <li
                    key={`${h.at.toISOString()}-${i}`}
                    className="flex flex-col gap-0.5 border-l-2 border-ld-border py-1.5 pl-4 sm:flex-row sm:gap-4"
                  >
                    <time
                      dateTime={h.at.toISOString()}
                      className="ld-small ld-num w-56 shrink-0 text-ld-muted"
                    >
                      {formatDateTime(h.at)}
                    </time>
                    <p className="ld-small text-ld-ink">
                      <span className="font-semibold text-ld-navy">{h.actorName ?? 'Sistema'}</span>{' '}
                      {actionLabel(h.action).toLowerCase()}
                    </p>
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
          {selfReview ? (
            <p className="ld-small">No puedes revisar tu propia cuenta.</p>
          ) : (
            <DecisionPanel
              userId={user.id}
              userName={user.name}
              status={user.status}
              missing={missing}
            />
          )}
          {c?.decidedAt ? (
            <p className="ld-small mt-4 border-t border-ld-border pt-3 text-ld-muted">
              Última decisión el {formatDateTime(c.decidedAt)}
              {c.decidedByName ? ` por ${c.decidedByName}` : ''}.
            </p>
          ) : null}
        </aside>
      </div>
    </FeedbackProvider>
  );
}
