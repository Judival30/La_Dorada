import { cn } from '@/lib/utils';

const BACK = 'M0 215 L70 175 L150 205 L260 120 L330 150 L420 95 L500 160 L580 140 L680 205 L790 110 L860 140 L940 60 L1010 120 L1090 100 L1200 170 V320 H0 Z';
const MID = 'M0 270 L100 235 L170 255 L290 190 L360 215 L470 165 L540 205 L640 182 L720 250 L830 205 L900 228 L1010 178 L1090 215 L1200 200';
const FRONT = 'M0 300 L160 276 L260 296 L400 270 L560 298 L700 280 L860 300 L1000 282 L1200 298 V320 H0 Z';

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
