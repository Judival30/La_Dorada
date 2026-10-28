import { Check, Circle } from 'lucide-react';
import Link from 'next/link';
import {
  DOCUMENT_LABELS,
  requiredDocuments,
  type OnboardingStep,
  type VerificationDocumentType,
} from '@/domain/onboarding';
import { SECTOR_LABELS } from '@/domain/sectors';
import type { OnboardingView } from '@/server/services/onboarding';
import { formatPhone } from './format';

const BUYER_TYPE_LABELS = {
  FUND: 'Fondo de inversión',
  STRATEGIC: 'Empresa estratégica',
  FAMILY_OFFICE: 'Family office',
  ANGEL: 'Inversionista a título personal',
} as const;

type Row = { step: OnboardingStep; title: string; lines: string[] };

function rowsFor(view: OnboardingView): Row[] {
  const { profile, role } = view;
  const s1 = profile.step1;
  const s3 = profile.step3;
  const s4 = profile.step4;

  const legal: string[] = [];
  if (role === 'SELLER') {
    if (view.isLegalRepresentative !== null) {
      legal.push(
        view.isLegalRepresentative
          ? 'Eres el representante legal de la empresa'
          : 'Actúas con un poder o autorización',
      );
    }
  } else if (view.buyerType) {
    legal.push(BUYER_TYPE_LABELS[view.buyerType]);
    if (s3 && 'entityName' in s3 && s3.entityName) legal.push(s3.entityName);
  }

  const company: string[] = [];
  if (s4 && 'legalName' in s4) {
    company.push(
      s4.legalName,
      `NIT ${s4.nit}`,
      `${SECTOR_LABELS[s4.sector]}, ${s4.city}, ${s4.department}`,
    );
  } else if (s4 && 'sectors' in s4) {
    company.push(
      s4.sectors.map((x) => SECTOR_LABELS[x]).join(', '),
      `${s4.regions.length} ${s4.regions.length === 1 ? 'departamento' : 'departamentos'}`,
      `Ticket de COP ${s4.ticketMinMillions.toLocaleString('es-CO')} M a COP ${s4.ticketMaxMillions.toLocaleString('es-CO')} M`,
    );
  }

  const nameOf = (t: VerificationDocumentType) => {
    const d = view.documents.findLast((x) => x.type === t);
    return d ? `${DOCUMENT_LABELS[t]}${d.originalName ? `: ${d.originalName}` : ''}` : null;
  };
  const required = requiredDocuments({
    role,
    isLegalRepresentative: view.isLegalRepresentative,
    buyerType: view.buyerType,
  });
  const support = required
    .filter((t) => t !== 'NATIONAL_ID')
    .map((t) => nameOf(t) ?? `${DOCUMENT_LABELS[t]}: falta`);

  return [
    { step: 1, title: 'Perfil', lines: s1 ? [s1.name, formatPhone(s1.phone), s1.position] : [] },
    { step: 2, title: 'Identidad', lines: [nameOf('NATIONAL_ID')].filter((x) => x !== null) },
    { step: 3, title: role === 'SELLER' ? 'Representación legal' : 'Representación', lines: legal },
    { step: 4, title: role === 'SELLER' ? 'Empresa' : 'Criterios de inversión', lines: company },
    { step: 5, title: 'Documentos de soporte', lines: support },
  ];
}

/** Everything the person is about to send, one row per step, with a link back to edit it. */
export function ReviewSummary({ view, editable }: { view: OnboardingView; editable: boolean }) {
  const rows = rowsFor(view);
  return (
    <dl className="divide-y divide-ld-border">
      {rows.map((r) => {
        const done = view.progress.completedSteps.includes(r.step);
        return (
          <div
            key={r.step}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-4 first:pt-0 sm:grid-cols-[11rem_1fr_auto]"
          >
            <dt className="ld-small flex items-center gap-2 font-semibold text-ld-navy">
              {done ? (
                <Check
                  aria-hidden="true"
                  className="size-4 text-[var(--ld-success)]"
                  strokeWidth={3}
                />
              ) : (
                <Circle aria-hidden="true" className="size-4 text-ld-muted" />
              )}
              {r.title}
              <span className="sr-only">{done ? ': completo' : ': incompleto'}</span>
            </dt>
            <dd className="ld-small col-span-2 row-start-2 flex flex-col text-ld-ink sm:col-span-1 sm:col-start-2 sm:row-start-1">
              {r.lines.length > 0 ? (
                r.lines.map((l, i) => (
                  <span key={`${i}-${l}`} className="break-words">
                    {l}
                  </span>
                ))
              ) : (
                <span className="text-ld-muted">Sin completar</span>
              )}
            </dd>
            {editable ? (
              <dd className="col-start-2 row-start-1 -my-2 sm:col-start-3">
                <Link
                  href={`/onboarding?paso=${r.step}`}
                  className="ld-small inline-flex min-h-11 items-center font-medium text-ld-primary underline underline-offset-4"
                >
                  Editar
                  <span className="sr-only">: {r.title}</span>
                </Link>
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}
