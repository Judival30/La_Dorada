'use client';

import { CircleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { submitAction } from '../actions';

export function SubmitButton({ canSubmit, resubmit }: { canSubmit: boolean; resubmit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send() {
    setError(null);
    start(async () => {
      const res = await submitAction();
      if ('error' in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className="empty:hidden">
        {error ? (
          <p
            role="alert"
            className="ld-small flex items-start gap-2 rounded-[var(--ld-radius-control)] bg-[var(--ld-danger-soft)] px-3 py-2.5 font-medium text-[var(--ld-danger-ink)]"
          >
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="whitespace-pre-line">{error}</span>
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={send}
        disabled={!canSubmit || pending}
        className="ld-btn ld-btn-primary w-full sm:w-auto sm:self-start"
      >
        {pending ? 'Enviando…' : resubmit ? 'Reenviar a revisión' : 'Enviar a revisión'}
      </button>
    </div>
  );
}
