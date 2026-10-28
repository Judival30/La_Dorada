'use client';

import { useState } from 'react';
import {
  EVALUATION_ITEM_STATUSES,
  EVALUATION_ITEM_STATUS_META,
  type EvaluationItemKind,
  type EvaluationItemStatus,
} from '@/domain/evaluation';
import { StatusChip } from '@/components/ld/status-chip';
import { useReviewFeedback } from '../../users/_components/feedback';
import { setEvaluationItemAction } from '../actions';

type Props = {
  opportunityId: string;
  kind: EvaluationItemKind;
  label: string;
  description: string;
  computed: boolean;
  status: EvaluationItemStatus | null;
  notes: string | null;
  editable: boolean;
};

/**
 * One row of the evaluation matrix. The computed row (documentary) is a chip;
 * the others are a select that saves on change, plus a note saved on blur.
 */
export function MatrixItem({
  opportunityId,
  kind,
  label,
  description,
  computed,
  status,
  notes,
  editable,
}: Props) {
  const { run, busy } = useReviewFeedback();
  const [note, setNote] = useState(notes ?? '');
  const id = `matrix-${kind}`;

  const save = (nextStatus: EvaluationItemStatus, nextNote: string) =>
    run(() => setEvaluationItemAction(opportunityId, kind, nextStatus, nextNote.trim()));

  return (
    <li className="grid gap-3 border-b border-ld-border py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start md:gap-6">
      <div className="min-w-0">
        <label htmlFor={computed ? undefined : id} className="font-semibold text-ld-navy">
          {label}
        </label>
        <p className="ld-small mt-0.5 max-w-[56ch] text-ld-muted">{description}</p>
        {!computed && editable ? (
          <input
            type="text"
            aria-label={`Notas de ${label}`}
            value={note}
            maxLength={500}
            disabled={!status || busy}
            placeholder={status ? 'Notas del revisor (opcional)' : 'Elige un estado para añadir notas'}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (status && note.trim() !== (notes ?? '')) void save(status, note);
            }}
            className="ld-field ld-small mt-2 w-full max-w-md !min-h-10"
          />
        ) : notes ? (
          <p className="ld-small mt-2 text-ld-ink">{notes}</p>
        ) : null}
      </div>
      <div className="max-md:order-1">
        {computed ? (
          status ? (
            <StatusChip tone={EVALUATION_ITEM_STATUS_META[status].tone}>
              {EVALUATION_ITEM_STATUS_META[status].label}
            </StatusChip>
          ) : null
        ) : editable ? (
          <select
            id={id}
            value={status ?? ''}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as EvaluationItemStatus;
              if (next) void save(next, note);
            }}
            className="ld-field w-full"
          >
            <option value="" disabled>
              Sin evaluar
            </option>
            {EVALUATION_ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVALUATION_ITEM_STATUS_META[s].label}
              </option>
            ))}
          </select>
        ) : status ? (
          <StatusChip tone={EVALUATION_ITEM_STATUS_META[status].tone}>
            {EVALUATION_ITEM_STATUS_META[status].label}
          </StatusChip>
        ) : (
          <span className="ld-small text-ld-muted">Sin evaluar</span>
        )}
      </div>
    </li>
  );
}
