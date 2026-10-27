import { cn } from '@/lib/utils';

const BACK = 'M0 230 L110 150 L190 195 L300 100 L400 170 L520 120 L640 200 L760 90 L880 175 L980 130 L1100 190 L1200 150 V320 H0 Z';
const MID = 'M0 262 L90 215 L200 250 L330 172 L430 235 L560 158 L690 245 L820 168 L940 240 L1060 192 L1200 252';
const FRONT = 'M0 296 L140 262 L280 291 L420 256 L580 293 L740 262 L900 294 L1050 268 L1200 293 V320 H0 Z';

const TONES = {
  /** Over a navy background (login panel). */
  navy: { back: '#17398A', mid: '#102F78', front: '#0A2461' },
  /** Over a light background, landing on a navy block of #0B2A6B. */
  light: { back: '#D5E2FA', mid: '#2A52B0', front: '#0B2A6B' },
} as const;

type RidgeProps = { tone?: keyof typeof TONES; className?: string };

/**
 * The Andean crest, La Dorada's one memorable gesture: three layers of mountain and a
 * single gold line that traces the ridge. The line draws itself once on load; reduced
 * motion shows it already drawn.
 */
export function Ridge({ tone = 'navy', className }: RidgeProps) {
  const c = TONES[tone];
  return (
    <svg
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className={cn('block w-full', className)}
    >
      <path d={BACK} fill={c.back} />
      <path d={`${MID} V320 H0 Z`} fill={c.mid} />
      <path
        d={MID}
        pathLength={1}
        fill="none"
        stroke="#F2B21B"
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
        className="ld-crest-line"
      />
      <path d={FRONT} fill={c.front} />
    </svg>
  );
}

/** Thin version for the sidebar brand card: the gold line alone over a soft base. */
export function RidgeMini({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn('block h-8 w-full', className)}
    >
      <path d="M0 40 L0 28 L30 18 L55 26 L90 8 L120 24 L152 12 L185 26 L215 16 L240 24 V40 Z" fill="#DCE7FB" />
      <path d="M0 28 L30 18 L55 26 L90 8 L120 24 L152 12 L185 26 L215 16 L240 24" fill="none" stroke="#F2B21B" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
