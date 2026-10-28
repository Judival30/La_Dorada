'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReviewActionResult } from '../actions';

type Message = { kind: 'ok' | 'error'; text: string; id: number };

type Feedback = {
  /** Runs a server action, shows its confirmation or error, and refreshes the page data. */
  run: (action: () => Promise<ReviewActionResult>) => Promise<ReviewActionResult>;
  busy: boolean;
};

const Ctx = createContext<Feedback | null>(null);

export function useReviewFeedback(): Feedback {
  const v = useContext(Ctx);
  if (!v) throw new Error('useReviewFeedback must be used inside <FeedbackProvider>');
  return v;
}

/**
 * One shared status line for every action on the review page. It is a polite
 * live region so the confirmation ("Registro aprobado") or the error is
 * announced, and it sits fixed at the bottom so it is seen wherever the click was.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    async (action: () => Promise<ReviewActionResult>) => {
      setPending((n) => n + 1);
      clearTimeout(timer.current);
      try {
        const result = await action();
        const next: Message =
          'ok' in result
            ? { kind: 'ok', text: result.message, id: Date.now() }
            : { kind: 'error', text: result.error, id: Date.now() };
        setMessage(next);
        if (next.kind === 'ok') {
          router.refresh();
          timer.current = setTimeout(() => setMessage(null), 6000);
        }
        return result;
      } catch {
        const result: ReviewActionResult = {
          error: 'No pudimos completar la acción. Revisa tu conexión e intenta de nuevo.',
        };
        setMessage({ kind: 'error', text: result.error, id: Date.now() });
        return result;
      } finally {
        setPending((n) => n - 1);
      }
    },
    [router],
  );

  return (
    <Ctx.Provider value={{ run, busy: pending > 0 }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 empty:hidden"
      >
        {message ? (
          <p
            key={message.id}
            className={`pointer-events-auto flex max-w-xl items-start gap-2.5 rounded-[var(--ld-radius-control)] border px-4 py-3 text-[0.9375rem] font-medium shadow-[0_12px_40px_rgba(11,42,107,0.28)] ${
              message.kind === 'ok'
                ? 'border-[var(--ld-success)] bg-[var(--ld-success-soft)] text-[var(--ld-success-ink)]'
                : 'border-[var(--ld-danger)] bg-[var(--ld-danger-soft)] text-[var(--ld-danger-ink)]'
            }`}
          >
            {message.kind === 'ok' ? (
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            ) : (
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            )}
            <span className="whitespace-pre-line">{message.text}</span>
          </p>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
