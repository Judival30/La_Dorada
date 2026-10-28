/** '+573001234567' → '+57 300 123 4567'. Anything else is returned untouched. */
export function formatPhone(value: string): string {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(value);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : value;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(d);
}
