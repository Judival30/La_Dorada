import { z } from 'zod';
import { USER_STATUSES, type UserStatus } from '@/domain/machines/user';

/** Queue filters in the URL: `?rol=BUYER|SELLER&estado=...&q=...&pagina=N`. Anything invalid falls back to "no filter". */
const schema = z.object({
  rol: z.enum(['BUYER', 'SELLER']).optional().catch(undefined),
  estado: z.enum(USER_STATUSES).optional().catch(undefined),
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined)),
  pagina: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type QueueQuery = {
  role?: 'BUYER' | 'SELLER';
  status?: UserStatus;
  q?: string;
  page: number;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseQueueQuery(
  raw: Record<string, string | string[] | undefined>,
): QueueQuery {
  const p = schema.parse({
    rol: first(raw.rol),
    estado: first(raw.estado),
    q: first(raw.q),
    pagina: first(raw.pagina),
  });
  return { role: p.rol, status: p.estado, q: p.q, page: p.pagina ?? 1 };
}

export function queueHref(query: Partial<QueueQuery>): string {
  const params = new URLSearchParams();
  if (query.role) params.set('rol', query.role);
  if (query.status) params.set('estado', query.status);
  if (query.q) params.set('q', query.q);
  if (query.page && query.page > 1) params.set('pagina', String(query.page));
  const s = params.toString();
  return s ? `/bo/users?${s}` : '/bo/users';
}
