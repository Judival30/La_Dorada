const DAY = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Bogota',
});
const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
});

/** "12 abr 2026" (es-CO, Bogotá). */
export const formatDay = (d: Date): string => DAY.format(d).replaceAll(' de ', ' ');
/** "12 abr 2026, 3:40 p. m." (es-CO, Bogotá). */
export const formatDateTime = (d: Date): string => DATE_TIME.format(d).replaceAll(' de ', ' ');

/** File size in KB / MB, es-CO decimals. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

/** Company-form suffixes ignored for initials ("Inversiones Pacífico S.A.S." → "IP"). */
const LEGAL_SUFFIX = /^(s\.?a\.?s\.?|s\.?a\.?|ltda\.?|s\.?en\.?c\.?|e\.?u\.?|&)$/i;

/** Up to two initials for an avatar. */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p && !LEGAL_SUFFIX.test(p));
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
