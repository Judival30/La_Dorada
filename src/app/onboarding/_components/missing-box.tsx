import { Info } from 'lucide-react';
import Link from 'next/link';
import type { OnboardingStep } from '@/domain/onboarding';

type Missing = { step: OnboardingStep; reason: string };

/** "Qué falta y por qué" for one step, or for every step when `showLinks` is on. */
export function MissingBox({
  items,
  showLinks = false,
  titles,
}: {
  items: Missing[];
  showLinks?: boolean;
  titles?: Record<number, string>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[var(--ld-radius-control)] border border-ld-border bg-ld-bg p-4">
      <p className="ld-small flex items-center gap-2 font-semibold text-ld-navy">
        <Info aria-hidden="true" className="size-4 text-ld-primary" />
        Qué falta
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((m) => (
          <li key={`${m.step}-${m.reason}`} className="ld-small max-w-[68ch] text-ld-ink">
            {showLinks ? (
              <Link
                href={`/onboarding?paso=${m.step}`}
                className="font-medium text-ld-primary underline underline-offset-4"
              >
                Paso {m.step}
                {titles?.[m.step] ? `, ${titles[m.step]}` : ''}
              </Link>
            ) : null}
            {showLinks ? ': ' : null}
            {m.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
