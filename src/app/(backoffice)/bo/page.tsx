import type { Metadata } from 'next';
import Link from 'next/link';
import { KpiCard } from '@/components/ld/kpi-card';
import { PageHeader } from '@/components/ld/page-header';
import type { UserStatus } from '@/domain/machines/user';
import { requireUser } from '@/server/auth/guard';
import { listUsersForReview } from '@/server/services/user-review';
import { queueHref } from './users/_components/query';

export const metadata: Metadata = { title: 'Inicio de Back Office' };

const KPIS: { status: UserStatus; label: string }[] = [
  { status: 'IN_REVIEW', label: 'Usuarios en revisión' },
  { status: 'CORRECTIONS_REQUESTED', label: 'Con correcciones pendientes' },
  { status: 'ENABLED', label: 'Habilitados' },
  { status: 'BLOCKED', label: 'Bloqueados' },
];

export default async function BackofficeHomePage() {
  const user = await requireUser('BACKOFFICE');
  const totals = await Promise.all(
    KPIS.map((k) => listUsersForReview(user, { status: k.status }).then((r) => r.total)),
  );
  const inReview = totals[0] ?? 0;

  return (
    <>
      <PageHeader
        title={`Hola, ${user.name}`}
        description={
          inReview > 0
            ? `Tienes ${inReview} ${inReview === 1 ? 'registro' : 'registros'} esperando tu revisión.`
            : 'No hay registros esperando tu revisión. Revisa usuarios y empresas, y supervisa los procesos en curso.'
        }
      />
      <section aria-label="Usuarios por estado">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPIS.map((k, i) => (
            <li key={k.status}>
              <Link
                href={queueHref({ status: k.status })}
                className="group block rounded-[var(--ld-radius-panel)] transition-colors [&>div]:h-full [&>div]:transition-colors hover:[&>div]:border-ld-border-strong hover:[&>div]:bg-ld-primary-soft"
              >
                <KpiCard value={String(totals[i] ?? 0)} label={k.label} />
                <span className="sr-only">Ver en la cola de validación</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
