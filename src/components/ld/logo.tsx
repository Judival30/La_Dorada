import { cn } from '@/lib/utils';

/** Two golden peaks, drawn from the pitch logo. Decorative: the wordmark carries the name. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" className={cn('h-8 w-auto shrink-0', className)}>
      <polygon points="0,46 24,6 50,46" fill="#F2B21B" />
      <polygon points="30,46 47,18 64,46" fill="#D99A0B" />
      <polygon points="24,6 34,23 24,31 15,23" fill="#FFD66B" opacity="0.85" />
    </svg>
  );
}

type LogoProps = {
  variant?: 'full' | 'mark';
  /** `light` is for navy backgrounds. */
  tone?: 'default' | 'light';
  className?: string;
};

export function Logo({ variant = 'full', tone = 'default', className }: LogoProps) {
  if (variant === 'mark') {
    return (
      <span className={cn('inline-flex', className)} role="img" aria-label="La Dorada">
        <LogoMark />
      </span>
    );
  }
  const light = tone === 'light';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-[1.375rem] font-bold tracking-[-0.01em]',
            light ? 'text-white' : 'text-ld-navy',
          )}
        >
          La Dorada
        </span>
        <span
          className={cn(
            'mt-1 whitespace-nowrap text-[0.625rem] font-medium tracking-[0.12em]',
            light ? 'text-[#B6C8EE]' : 'text-ld-muted',
          )}
        >
          EMPRESAS CON MÁS FUTURO
        </span>
      </span>
    </span>
  );
}
