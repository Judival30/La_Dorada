'use client';

import { Check, ExternalLink, X } from 'lucide-react';
import { StatusChip } from '@/components/ld/status-chip';
import type { VerificationDocumentType } from '@/domain/onboarding';
import type { UserReviewDocument } from '@/server/services/user-review';
import { reviewDocumentAction } from '../actions';
import { useReviewFeedback } from './feedback';
import { DOC_STATUS_LABEL, DOC_STATUS_TONE, formatDay, formatSize } from './labels';

type Props = {
  userId: string;
  documents: UserReviewDocument[];
  required: { type: VerificationDocumentType; label: string }[];
  /** Only while the applicant is in review can documents be approved or rejected. */
  canReview: boolean;
};

export function ReviewDocuments({ userId, documents, required, canReview }: Props) {
  const { run, busy } = useReviewFeedback();
  const missing = required.filter(
    (r) => !documents.some((d) => d.type === r.type && d.reviewStatus !== 'REJECTED'),
  );

  return (
    <div>
      {documents.length === 0 ? (
        <p className="text-ld-ink">La persona todavía no ha subido documentos.</p>
      ) : (
        <ul className="divide-y divide-ld-border">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ld-navy">{d.label}</p>
                <p className="ld-small break-words text-ld-muted">
                  {d.originalName ?? 'Documento'}, {formatSize(d.size)}. Subido el{' '}
                  {formatDay(d.createdAt)}.
                </p>
              </div>
              <StatusChip tone={DOC_STATUS_TONE[d.reviewStatus]} className="self-start sm:self-center">
                {DOC_STATUS_LABEL[d.reviewStatus]}
              </StatusChip>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/api/verification/documents/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ld-btn ld-btn-quiet min-h-10 px-3"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                  Ver<span className="sr-only"> {d.label}, se abre en una pestaña nueva</span>
                </a>
                {canReview ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || d.reviewStatus === 'APPROVED'}
                      onClick={() => run(() => reviewDocumentAction(userId, d.id, 'APPROVED'))}
                      className="ld-btn ld-btn-quiet min-h-10 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check aria-hidden="true" className="size-4 text-[var(--ld-success-ink)]" />
                      Aprobar<span className="sr-only"> {d.label}</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || d.reviewStatus === 'REJECTED'}
                      onClick={() => run(() => reviewDocumentAction(userId, d.id, 'REJECTED'))}
                      className="ld-btn ld-btn-quiet min-h-10 px-3 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <X aria-hidden="true" className="size-4 text-[var(--ld-danger-ink)]" />
                      Rechazar<span className="sr-only"> {d.label}</span>
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 ? (
        <p className="ld-small mt-4 rounded-[var(--ld-radius-control)] bg-[var(--ld-warning-soft)] px-3 py-2.5 text-[var(--ld-warning-ink)]">
          Falta subir: {missing.map((m) => m.label).join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
