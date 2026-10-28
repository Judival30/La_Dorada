'use client';

import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UserReviewChecklistItem } from '@/server/services/user-review';
import { runKycScreeningAction, toggleKycItemAction } from '../actions';
import { useReviewFeedback } from './feedback';
import { formatDateTime } from './labels';

type Item = UserReviewChecklistItem & { screening: boolean };
type Props = { userId: string; items: Item[]; canReview: boolean };

export function KycChecklist({ userId, items, canReview }: Props) {
  const { run, busy } = useReviewFeedback();
  // Shows the click at once; the server value takes over when the page data refreshes.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  useEffect(() => setLocal({}), [items]);

  async function toggle(itemId: string, done: boolean) {
    setLocal((l) => ({ ...l, [itemId]: done }));
    const result = await run(() => toggleKycItemAction(userId, itemId, done));
    if ('error' in result) {
      setLocal((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== itemId)));
    }
  }

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-ld-ink">Este registro no tiene checklist KYC.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const id = `kyc-${item.id}`;
            return (
              <li key={item.id} className="rounded-[var(--ld-radius-control)] px-1 py-1.5">
                <div className="flex items-start gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    checked={local[item.id] ?? item.done}
                    disabled={!canReview || busy}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                    className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--ld-primary)] disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="cursor-pointer text-ld-navy">
                      {item.label}
                    </label>
                    {item.done && item.checkedAt ? (
                      <p className="ld-note text-ld-muted">
                        Verificado por {item.checkedByName ?? 'el equipo'} el{' '}
                        {formatDateTime(item.checkedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {item.screening && canReview ? (
                  <div className="mt-2 ml-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => runKycScreeningAction(userId))}
                      className="ld-btn ld-btn-quiet min-h-10 px-3 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ShieldCheck aria-hidden="true" className="size-4" />
                      Consultar listas restrictivas
                    </button>
                    <span className="ld-note rounded-full bg-[var(--ld-warning-soft)] px-2.5 py-1 text-[var(--ld-warning-ink)]">
                      Simulado: no consulta fuentes reales
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
